# Redes en AWS — VPC, ALB, CloudFront, Route53

## VPC — Virtual Private Cloud

### Diseño de VPC para producción

Un error común es crear VPCs con CIDRs demasiado pequeños. Planifica para el crecimiento.

```
VPC CIDR recomendado: /16 (65,536 IPs) — nunca más pequeño en producción

Estructura de subnets en 3 AZs:
  VPC: 10.0.0.0/16

  Public subnets (ALB, NAT Gateway, Bastion)
    10.0.0.0/24  → us-east-1a  (256 IPs)
    10.0.1.0/24  → us-east-1b
    10.0.2.0/24  → us-east-1c

  Private subnets (aplicación: EC2, ECS, EKS)
    10.0.10.0/23 → us-east-1a  (512 IPs)
    10.0.12.0/23 → us-east-1b
    10.0.14.0/23 → us-east-1c

  Database subnets (RDS, ElastiCache — sin salida a internet)
    10.0.20.0/24 → us-east-1a
    10.0.21.0/24 → us-east-1b
    10.0.22.0/24 → us-east-1c

  Reserved para futuro
    10.0.30.0/24 → us-east-1a (expansión)
    ...
```

### Componentes de red esenciales
```
Internet Gateway (IGW):
  Permite tráfico de/hacia internet a subnets públicas
  1 por VPC, altamente disponible por defecto

NAT Gateway:
  Permite que instancias privadas salgan a internet (sin entrar)
  1 por AZ para HA (si el NAT falla, las instancias privadas de esa AZ pierden salida)
  Costo: $0.045/hr + $0.045/GB procesado — optimizar con VPC Endpoints

VPC Endpoints:
  Interface Endpoint: ENI privada para servicios AWS via PrivateLink
  Gateway Endpoint:   ruta para S3 y DynamoDB (gratis — SIEMPRE usar)

Transit Gateway:
  Hub centralizado para conectar múltiples VPCs y on-premises
  Reemplaza el VPC Peering cuando hay más de 3-4 VPCs

VPC Peering:
  Conexión directa entre 2 VPCs (no transitivo)
  Útil para pocos VPCs con tráfico bajo
```

### Security Groups vs NACLs
```
Security Groups (stateful — SIEMPRE la primera línea de defensa):
  Aplican a nivel de ENI (instancia, ELB, RDS, etc.)
  Solo reglas de ALLOW (deny implícito)
  Stateful: si permites entrada en puerto 443, la respuesta sale automáticamente
  Pueden referenciar otros security groups (mejor que IPs)

NACLs (stateless — segunda línea, opcional):
  Aplican a nivel de subnet
  Reglas de ALLOW y DENY explícitas
  Stateless: debes permitir tráfico de entrada Y salida
  Útil para bloquear IPs específicas o rangos maliciosos

Regla general:
  Usa Security Groups para control de acceso granular (siempre)
  Usa NACLs solo cuando necesitas bloquear IPs o rangos explícitamente
```

### Security Groups — diseño por capas
```
sg-alb (Application Load Balancer):
  Inbound:  443 from 0.0.0.0/0 (internet)
  Outbound: 8080 to sg-app

sg-app (Application tier):
  Inbound:  8080 from sg-alb (solo del ALB)
  Outbound: 5432 to sg-db
             443 to 0.0.0.0/0 (para calls a APIs externas — o mejor: VPC Endpoint)

sg-db (Database tier):
  Inbound:  5432 from sg-app (solo de la app)
  Outbound: ninguna necesaria (stateful)

sg-ecs-tasks:
  Inbound:  puerto de la app from sg-alb
  Outbound: todo a sg-db, VPC Endpoints, NAT para internet

Principio: ningún security group debe tener 0.0.0.0/0 en inbound salvo el ALB público
```

---

## Application Load Balancer (ALB)

### Configuración de ALB para producción
```yaml
# CloudFormation
ALB:
  Type: AWS::ElasticLoadBalancingV2::LoadBalancer
  Properties:
    Type: application
    Scheme: internet-facing
    SecurityGroups: [!Ref ALBSecurityGroup]
    Subnets: [!Ref PublicSubnet1, !Ref PublicSubnet2, !Ref PublicSubnet3]
    LoadBalancerAttributes:
      - Key: access_logs.s3.enabled
        Value: true                          # siempre habilitar access logs
      - Key: access_logs.s3.bucket
        Value: !Ref LogsBucket
      - Key: idle_timeout.timeout_seconds
        Value: 60
      - Key: routing.http2.enabled
        Value: true
      - Key: deletion_protection.enabled
        Value: true                          # evitar borrado accidental en prod

# HTTPS Listener con redirect de HTTP
HTTPSListener:
  Type: AWS::ElasticLoadBalancingV2::Listener
  Properties:
    LoadBalancerArn: !Ref ALB
    Port: 443
    Protocol: HTTPS
    Certificates:
      - CertificateArn: !Ref Certificate   # ACM certificate
    SslPolicy: ELBSecurityPolicy-TLS13-1-2-2021-06  # TLS 1.2+ mínimo
    DefaultActions:
      - Type: forward
        TargetGroupArn: !Ref DefaultTargetGroup

# Redirect HTTP → HTTPS
HTTPListener:
  Type: AWS::ElasticLoadBalancingV2::Listener
  Properties:
    LoadBalancerArn: !Ref ALB
    Port: 80
    Protocol: HTTP
    DefaultActions:
      - Type: redirect
        RedirectConfig:
          Protocol: HTTPS
          Port: 443
          StatusCode: HTTP_301
```

### ALB — Routing rules avanzadas
```yaml
# Path-based routing para microservicios
OrdersRule:
  Type: AWS::ElasticLoadBalancingV2::ListenerRule
  Properties:
    ListenerArn: !Ref HTTPSListener
    Priority: 10
    Conditions:
      - Field: path-pattern
        Values: ["/api/v1/orders/*"]
    Actions:
      - Type: forward
        TargetGroupArn: !Ref OrdersTargetGroup

# Header-based routing (para A/B testing o canary)
CanaryRule:
  Type: AWS::ElasticLoadBalancingV2::ListenerRule
  Properties:
    Priority: 5
    Conditions:
      - Field: http-header
        HttpHeaderConfig:
          HttpHeaderName: X-Canary
          Values: ["true"]
    Actions:
      - Type: forward
        TargetGroupArn: !Ref CanaryTargetGroup
```

---

## CloudFront — CDN Global

### Cuándo usar CloudFront
```
✅ Static assets (CSS, JS, imágenes) — cachear en edge
✅ Sitios estáticos en S3
✅ Reducir latencia para usuarios globales
✅ Protección DDoS (integrado con Shield Standard)
✅ WAF en la capa de edge (antes de llegar al origen)
✅ Firmar URLs para contenido privado

Comportamiento por defecto:
  TTL de cache: 24 horas para objetos con Cache-Control: max-age
  Comprimir: gzip/brotli automático si el cliente lo soporta
  HTTP/2 y HTTP/3: habilitado por defecto
```

### Distribución de CloudFront — configuración esencial
```yaml
CloudFrontDistribution:
  Type: AWS::CloudFront::Distribution
  Properties:
    DistributionConfig:
      Enabled: true
      HttpVersion: http2and3
      PriceClass: PriceClass_100          # solo US/Europe/Asia (más barato que All)
      # PriceClass_All → global, mayor costo, menor latencia en Latam/África

      Origins:
        # Origen S3 para assets estáticos
        - Id: S3Origin
          DomainName: !GetAtt AssetsBucket.RegionalDomainName
          S3OriginConfig:
            OriginAccessIdentity: ""
          OriginAccessControlId: !GetAtt OAC.Id   # OAC en lugar de OAI (más seguro)

        # Origen ALB para API
        - Id: ALBOrigin
          DomainName: !GetAtt ALB.DNSName
          CustomOriginConfig:
            HTTPSPort: 443
            OriginProtocolPolicy: https-only
            OriginSSLProtocols: [TLSv1.2]

      CacheBehaviors:
        # API — sin cache (o cache muy corto)
        - PathPattern: /api/*
          TargetOriginId: ALBOrigin
          ViewerProtocolPolicy: redirect-to-https
          CachePolicyId: 4135ea2d-6df8-44a3-9df3-4b5a84be39ad  # CachingDisabled
          OriginRequestPolicyId: b689b0a8-53d0-40ab-baf2-68738e2966ac  # AllViewerExceptHostHeader

      DefaultCacheBehavior:
        # Assets estáticos — cache agresivo
        TargetOriginId: S3Origin
        ViewerProtocolPolicy: redirect-to-https
        CachePolicyId: 658327ea-f89d-4fab-a63d-7e88639e58f6    # CachingOptimized
        Compress: true

      # WAF
      WebACLId: !Ref WAFWebACL

      ViewerCertificate:
        AcmCertificateArn: !Ref Certificate
        SslSupportMethod: sni-only
        MinimumProtocolVersion: TLSv1.2_2021

      Logging:
        Bucket: !GetAtt LogsBucket.DomainName
        Prefix: cloudfront/
```

---

## Route53 — DNS y Health Checks

### Patrones de routing
```
Simple Routing:          1 record → 1 destino
Weighted Routing:        distribuir tráfico por porcentaje (A/B testing, canary)
Latency Routing:         enrutar al endpoint con menor latencia desde el usuario
Geolocation Routing:     enrutar según ubicación geográfica del usuario
Failover Routing:        primary + secondary (activo-pasivo)
Multi-Value Answer:      hasta 8 IPs, con health checks por registro

Ejemplo — Failover con Health Check:
  Primary:    ALB en us-east-1 (active)
  Secondary:  ALB en us-west-2 (standby) o S3 static error page
  Health check cada 30s, failover automático si primary falla
```

### Health Checks avanzados
```yaml
HealthCheck:
  Type: AWS::Route53::HealthCheck
  Properties:
    HealthCheckConfig:
      Type: HTTPS
      FullyQualifiedDomainName: api.myapp.com
      Port: 443
      ResourcePath: /health
      RequestInterval: 30          # 30s entre checks
      FailureThreshold: 3          # 3 fallos consecutivos = unhealthy
      MeasureLatency: true         # CloudWatch latency metrics
      Regions:                     # desde múltiples regiones de Route53
        - us-east-1
        - eu-west-1
        - ap-southeast-1
```

### ACM — Certificados SSL/TLS
```
Certificados en ACM son GRATIS para servicios AWS (ALB, CloudFront, API Gateway)
Renovación automática — nunca expirarán si el dominio sigue en Route53

Para CloudFront: el certificado DEBE estar en us-east-1
Para ALB/API Gateway: el certificado debe estar en la misma región del recurso

Wildcard certificate: *.myapp.com cubre todos los subdominios de un nivel
DNS validation (recomendado): Route53 añade el CNAME automáticamente
```

---

## VPC Endpoints — Eliminar el NAT Gateway para servicios AWS

```
Sin VPC Endpoint:
  EC2/Lambda → NAT Gateway → Internet → S3/DynamoDB/SQS/etc.
  Costo: $0.045/hr (NAT) + $0.045/GB

Con VPC Endpoint:
  EC2/Lambda → VPC Endpoint → S3/DynamoDB/SQS/etc.
  Costo: $0.01/hr (Interface) o gratis (Gateway)
  Menor latencia, tráfico no sale de la red de AWS

Gateway Endpoints (gratis — siempre crear):
  S3, DynamoDB

Interface Endpoints (precio: ~$0.01/hr/AZ + $0.01/GB):
  Secretos: Secrets Manager, SSM Parameter Store
  Mensajería: SQS, SNS, EventBridge
  Containers: ECR (api + dkr), ECS
  Observabilidad: CloudWatch Logs, X-Ray
  Lambda, KMS, STS

Regla: si tienes workloads que hacen llamadas frecuentes a servicios AWS,
los VPC Endpoints se pagan solos comparado con el NAT Gateway
```
