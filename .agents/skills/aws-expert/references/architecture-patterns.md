# Patrones de Arquitectura en AWS

## Well-Architected Review — Cómo Hacerlo

AWS Well-Architected Tool está disponible en la consola (gratis). Úsalo para revisar formalmente cada workload importante.

### Preguntas clave por pilar

**Operational Excellence**
```
OPS 1: ¿Cómo determinas qué es prioritario?
OPS 2: ¿Cómo estructuras tu organización para apoyar tus objetivos?
OPS 5: ¿Cómo reduces los defectos, facilitas la remediación y mejoras el flujo?
OPS 8: ¿Cómo entiendes el estado de tu workload?
OPS 10: ¿Cómo gestionas los eventos de workload?

Señales de problema:
  ❌ Deploys manuales (sin CI/CD)
  ❌ Sin runbooks para incidentes
  ❌ Sin alertas en CloudWatch
  ❌ Configuración manual de infraestructura
```

**Security**
```
SEC 2: ¿Cómo gestionas identidades y permisos?
SEC 4: ¿Cómo detectas y proteges tu red?
SEC 8: ¿Cómo proteges tus datos en reposo?
SEC 9: ¿Cómo proteges tus datos en tránsito?

Señales de problema:
  ❌ IAM Users con access keys long-lived
  ❌ Recursos sin cifrado KMS
  ❌ Security Groups con 0.0.0.0/0 inbound
  ❌ S3 buckets públicos sin razón
  ❌ CloudTrail deshabilitado
```

**Reliability**
```
REL 2: ¿Cómo planificas la topología de red?
REL 6: ¿Cómo monitorizas los recursos de tu workload?
REL 9: ¿Cómo pruebas la confiabilidad?
REL 10: ¿Cómo planificas para la recuperación ante desastres?

Señales de problema:
  ❌ Sin Multi-AZ en producción
  ❌ Sin health checks en el load balancer
  ❌ Sin pruebas de recuperación (DR drills)
  ❌ SPOF: una sola base de datos, un solo servidor, etc.
```

---

## Patrones de Arquitectura Comunes

### Patrón 1 — Web App Estándar (3-tier)
```
Descripción: La arquitectura más común para aplicaciones web empresariales.

Componentes:
  [Internet] → [CloudFront + WAF]
             → [ALB (Multi-AZ)]
             → [ECS Fargate / EC2 Auto Scaling (private subnets)]
             → [Aurora PostgreSQL Multi-AZ]
             → [ElastiCache Redis (sesiones/caché)]
             → [S3 (assets estáticos)]

Características:
  - Stateless application tier (sesiones en Redis o JWT)
  - Auto Scaling horizontal de la capa de aplicación
  - Read replicas en Aurora para escalar lecturas
  - CloudFront para reducir latencia y costo de egress
  - WAF para protección OWASP

Cuándo usarlo:
  - La mayoría de aplicaciones B2B y B2C
  - Team size: 3-20 developers
  - Tráfico: hasta ~100,000 usuarios concurrentes
```

### Patrón 2 — Microservicios Event-Driven
```
Descripción: Servicios desacoplados que se comunican via eventos.

Componentes:
  [API Gateway / ALB]
  → [Servicio A (ECS/Lambda)] → [EventBridge]
                                → [SQS → Servicio B]
                                → [SQS → Servicio C]
                                → [Kinesis → Analytics]
  Cada servicio tiene su propia base de datos (DynamoDB, RDS, etc.)

Características:
  - Servicios independientes por dominio de negocio
  - Sin llamadas síncronas directas entre servicios (solo via eventos)
  - Cada servicio puede escalar, fallar y deployarse independientemente
  - Eventual consistency entre servicios

Cuándo usarlo:
  - Equipos grandes con ownership por dominio
  - Necesidad de escala diferencial por servicio
  - Desacoplamiento de equipos de desarrollo
  - Alta disponibilidad independiente por capacidad
```

### Patrón 3 — Serverless API
```
Descripción: API completamente serverless, sin servidores que gestionar.

Componentes:
  [Route53] → [CloudFront + WAF]
            → [API Gateway HTTP API]
            → [Lambda Functions (por endpoint o dominio)]
            → [DynamoDB (primary store)]
            → [ElastiCache (caché de lectura, con VPC)]
            → [S3 (archivos/assets)]
            → [SQS/EventBridge (para operaciones async)]

Costo estimado:
  1 millón de requests/mes → ~$5-20/mes
  10 millones de requests/mes → ~$50-150/mes
  (vs ECS Fargate: ~$50-200/mes independiente del tráfico)

Cuándo usarlo:
  - Tráfico muy variable (0 a picos)
  - Startups o productos nuevos
  - APIs que no son 24/7 constantes
  - Cuando el equipo es pequeño (< 5 devs)
```

### Patrón 4 — Data Lake Architecture
```
Componentes:
  [Fuentes de datos]
  → Ingesta:
      Batch:      AWS DMS / Glue / DataSync → S3 Raw
      Streaming:  Kinesis Data Streams → Kinesis Firehose → S3 Raw
      APIs:       Lambda → S3 Raw

  → Almacenamiento en capas (medallion):
      Raw (Bronze):   S3/raw/     ← datos originales sin transformar
      Curated (Silver): S3/curated/ ← datos limpios y tipados (Parquet)
      Analytics (Gold): S3/analytics/ ← tablas de negocio agregadas

  → Procesamiento:
      AWS Glue (ETL serverless) → transformar Raw → Curated → Analytics
      AWS Glue Data Catalog → metadatos y esquemas

  → Consumo:
      Athena → SQL ad-hoc sobre S3 (pago por query)
      Redshift Spectrum → join entre Redshift y S3
      QuickSight → dashboards para negocio
      SageMaker → ML sobre los datos procesados

Formato recomendado: Apache Parquet
  Columnar, comprimido, 10-100x más rápido que CSV en Athena
  Reducción de costo 10x+ vs CSV (Athena cobra por bytes escaneados)
```

---

## Disaster Recovery — Estrategias por RTO/RPO

```
          RPO (datos perdidos)     RTO (tiempo de recuperación)
──────── ──────────────────────  ──────────────────────────────
Backup & Restore
          horas                   horas (24hr típico)
          Costo: más bajo
          Cómo: backups en S3, restaurar en DR

Pilot Light
          minutos                 minutos-horas
          Costo: bajo
          Cómo: DB replicando en DR region, infra mínima lista para escalar

Warm Standby
          segundos                minutos (< 15 min)
          Costo: medio
          Cómo: versión reducida del sistema running en DR region

Multi-Site Active-Active
          casi 0                  casi 0
          Costo: el más alto (duplicas infraestructura)
          Cómo: DynamoDB Global Tables + Aurora Global + Route53 routing
```

### Multi-Region Active-Active con Aurora Global
```yaml
# Aurora Global Database — replicación cross-region < 1 segundo de lag
AuroraGlobalCluster:
  Type: AWS::RDS::GlobalCluster
  Properties:
    GlobalClusterIdentifier: myapp-global
    Engine: aurora-postgresql
    EngineVersion: "15.4"
    DeletionProtection: true

# Cluster primario en us-east-1
PrimaryCluster:
  Type: AWS::RDS::DBCluster
  Properties:
    GlobalClusterIdentifier: !Ref AuroraGlobalCluster
    Engine: aurora-postgresql
    DBClusterIdentifier: myapp-primary

# Cluster secundario en us-west-2 (read replica cross-region)
# En caso de failover: promover manualmente o con managed failover
```

---

## Landing Zone — AWS Organizations Best Practices

### Estructura de cuentas recomendada
```
Root
├── Security OU
│   ├── Log Archive Account      ← todos los CloudTrail, Config, VPC Flow Logs
│   └── Security Tooling Account ← GuardDuty master, Security Hub master, SIEM
│
├── Infrastructure OU
│   ├── Network Account          ← Transit Gateway, DNS central, Direct Connect
│   └── Shared Services Account  ← Docker registry (ECR), artifacts, tools
│
├── Workloads OU
│   ├── Prod OU
│   │   ├── MyApp-Prod           ← producción aislada
│   │   └── AnotherApp-Prod
│   ├── Staging OU
│   │   └── MyApp-Staging
│   └── Dev OU
│       └── MyApp-Dev
│
└── Sandbox OU
    └── Dev-Sandbox accounts     ← one per developer, aislados

Beneficios del multi-account:
  - Blast radius limitado (un hack o error afecta solo esa cuenta)
  - Billing separado por equipo/producto
  - SCPs aplicados por OU
  - Límites de servicio independientes
  - Cumplimiento y auditoría simplificados
```

### SCPs esenciales para cualquier organización
```
1. DenyRootUserActions         → nadie usa root en producción
2. DenyRegionsNotApproved      → recursos solo en regiones autorizadas
3. ProtectCloudTrail           → nadie puede apagar el audit trail
4. RequireEncryptionForS3      → forzar cifrado en todos los buckets
5. DenyPublicS3Buckets         → sin acceso público a S3 (excepto donde se permite explícito)
6. RequireMFAForConsole        → MFA obligatorio para acceso humano
7. DenyLeaveOrganization       → las cuentas no pueden salirse solas
8. LimitEC2InstanceTypes       → solo tipos aprobados (controlar costos)
```
