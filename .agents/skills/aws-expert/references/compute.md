# Cómputo en AWS — EC2, Lambda, ECS, EKS, Fargate

## Cómo Elegir el Servicio de Cómputo

```
¿Necesitas control total del SO?
  Sí → EC2
  No → ¿Contenedores o funciones?
    Funciones → Lambda
    Contenedores → ¿Quieres gestionar el cluster?
      Sí → ECS con EC2 launch type / EKS
      No → ECS Fargate / EKS Fargate
```

---

## EC2 — Elastic Compute Cloud

### Tipos de instancia — nomenclatura
```
[familia][generación][atributos].[tamaño]
  t3.micro     → burstable, general purpose, micro
  m6i.xlarge   → general purpose, gen 6, Intel, extra large
  c7g.2xlarge  → compute optimized, gen 7, Graviton, 8 vCPU
  r6a.4xlarge  → memory optimized, gen 6, AMD, 16 vCPU
  p4d.24xlarge → GPU accelerated, gen 4, 96 vCPU + A100 GPUs

Familias clave:
  t3/t4g  → burstable, desarrollo, workloads variables
  m6i/m7g → general purpose, la mayoría de aplicaciones
  c6i/c7g → compute optimized, CPU intensivo (IA inference, gaming)
  r6i/r7g → memory optimized, in-memory DBs, caché, analytics
  i4i     → storage optimized, NoSQL, data warehousing local
  p4/g5   → GPU, ML training, rendering
  
Graviton (arm64):
  g → al final del tipo (m7g, c7g, r7g)
  20-40% mejor precio/rendimiento que x86 para la mayoría de workloads
  Verificar compatibilidad de dependencias antes de migrar
```

### Auto Scaling Group — configuración esencial
```yaml
# CloudFormation template snippet
AutoScalingGroup:
  Type: AWS::AutoScaling::AutoScalingGroup
  Properties:
    MinSize: 2                    # mínimo para HA
    MaxSize: 20
    DesiredCapacity: 2
    HealthCheckType: ELB          # usar health check del LB, no solo EC2
    HealthCheckGracePeriod: 300   # 5 min para que la app arranque
    MixedInstancesPolicy:         # usar Spot + On-Demand
      InstancesDistribution:
        OnDemandPercentageAboveBaseCapacity: 20   # 80% Spot
        SpotAllocationStrategy: price-capacity-optimized
      LaunchTemplate:
        LaunchTemplateSpecification:
          LaunchTemplateId: !Ref LaunchTemplate
          Version: !GetAtt LaunchTemplate.LatestVersionNumber
        Overrides:
          - InstanceType: m6i.xlarge
          - InstanceType: m6a.xlarge   # múltiples tipos = más disponibilidad de Spot
          - InstanceType: m5.xlarge

# Scaling policies
ScaleOutPolicy:
  Type: AWS::AutoScaling::ScalingPolicy
  Properties:
    PolicyType: TargetTrackingScaling
    TargetTrackingConfiguration:
      PredefinedMetricSpecification:
        PredefinedMetricType: ASGAverageCPUUtilization
      TargetValue: 70.0           # mantener CPU al 70%
```

### EC2 — Mejores prácticas
```
✅ Siempre usar Launch Templates (no Launch Configurations — deprecated)
✅ Multi-AZ con mínimo 2 instancias para producción
✅ UserData para bootstrapping (instalar dependencias, arrancar app)
✅ IMDSv2 obligatorio (protección contra SSRF)
✅ Instancias Graviton cuando la app es compatible
✅ Mezclar tipos de instancia en el ASG para disponibilidad de Spot
✅ Snapshots automáticos de EBS con AWS Backup
✅ SSM Session Manager en lugar de SSH (sin puertos abiertos)

❌ No abrir el puerto 22 (SSH) al mundo (0.0.0.0/0)
❌ No usar credenciales de AWS hardcodeadas — usar IAM Roles
❌ No una sola instancia sin ASG para producción
❌ No ignorar los savings plans si el workload es predecible
```

---

## AWS Lambda — Funciones Serverless

### Configuración y límites
```
Timeout máximo:      15 minutos
Memoria:             128 MB – 10,240 MB (CPU escala proporcionalmente)
Almacenamiento /tmp: 512 MB (configurable hasta 10 GB)
Payload de request:  6 MB (sync) / 256 KB (async)
Concurrencia por región: 1,000 por defecto (aumentable)
Cold start:          ~100-500ms (JVM peor, Go/Rust mejor, Node/Python intermedio)
```

### Lambda — patrones clave
```python
# Handler básico con structured logging y error handling
import json
import logging
import os
from typing import Any

# Usar aws-lambda-powertools para producción
from aws_lambda_powertools import Logger, Tracer, Metrics
from aws_lambda_powertools.metrics import MetricUnit

logger  = Logger(service="order-service")
tracer  = Tracer(service="order-service")
metrics = Metrics(namespace="OrderService")

@logger.inject_lambda_context(log_event=True)
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def handler(event: dict, context: Any) -> dict:
    try:
        order_id = event["pathParameters"]["orderId"]
        logger.info("Processing order", extra={"order_id": order_id})

        result = process_order(order_id)

        metrics.add_metric(name="OrdersProcessed", unit=MetricUnit.Count, value=1)

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "X-Request-Id": context.aws_request_id,
            },
            "body": json.dumps(result),
        }
    except OrderNotFoundError as e:
        logger.warning("Order not found", extra={"order_id": order_id})
        return {"statusCode": 404, "body": json.dumps({"error": str(e)})}
    except Exception as e:
        logger.exception("Unexpected error")
        raise  # re-raise para que Lambda marque como error y active DLQ/retry
```

### Lambda — optimización de cold starts
```
Estrategias:
1. Provisioned Concurrency   → pre-calienta instancias (costo adicional)
2. Runtime eficiente         → Node.js/Python < JVM (evitar Java en Lambda crítica)
3. Graviton2 (arm64)         → menor latencia, menor costo
4. SnapStart (Java)          → snapshot del estado inicializado, restaura rápido
5. Minimizar dependencias    → package size pequeño = inicialización más rápida
6. Lazy loading              → inicializar clientes fuera del handler, no dentro

# Configuración recomendada para producción
FunctionConfig:
  Architecture: arm64               # Graviton2 — 20% más barato, igual o más rápido
  MemorySize: 512                   # ajustar con Lambda Power Tuning
  ReservedConcurrentExecutions: 100 # evitar throttling en picos
  Environment:
    Variables:
      POWERTOOLS_SERVICE_NAME: order-service
      LOG_LEVEL: INFO
  Layers:
    - !Sub arn:aws:lambda:${AWS::Region}:017000801446:layer:AWSLambdaPowertoolsPythonV2-Arm64:latest
```

### Lambda con SQS — patrón estándar
```python
# Procesar mensajes de SQS con retry y DLQ
def handler(event: dict, context: Any) -> dict:
    batch_item_failures = []

    for record in event["Records"]:
        try:
            body = json.loads(record["body"])
            process_message(body)
        except Exception as e:
            logger.error(f"Failed to process {record['messageId']}: {e}")
            # Solo marcar como fallido este mensaje, no todo el batch
            batch_item_failures.append({"itemIdentifier": record["messageId"]})

    # Retornar los fallidos para que SQS los reintente
    return {"batchItemFailures": batch_item_failures}
```

---

## ECS Fargate — Contenedores sin gestión de servidores

### Task Definition
```json
{
  "family": "order-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/order-service-task-role",
  "containerDefinitions": [{
    "name": "order-service",
    "image": "ACCOUNT.dkr.ecr.REGION.amazonaws.com/order-service:latest",
    "portMappings": [{"containerPort": 8080, "protocol": "tcp"}],
    "environment": [
      {"name": "SPRING_PROFILES_ACTIVE", "value": "prod"}
    ],
    "secrets": [
      {
        "name": "DB_PASSWORD",
        "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:prod/db/password"
      }
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/order-service",
        "awslogs-region": "us-east-1",
        "awslogs-stream-prefix": "ecs"
      }
    },
    "healthCheck": {
      "command": ["CMD-SHELL", "curl -f http://localhost:8080/actuator/health || exit 1"],
      "interval": 30,
      "timeout": 5,
      "retries": 3,
      "startPeriod": 60
    }
  }]
}
```

### ECS Service con Auto Scaling
```yaml
# Application Auto Scaling para ECS
ECSServiceScaling:
  Type: AWS::ApplicationAutoScaling::ScalableTarget
  Properties:
    ServiceNamespace: ecs
    ResourceId: !Sub service/${ECSCluster}/${ECSService}
    ScalableDimension: ecs:service:DesiredCount
    MinCapacity: 2
    MaxCapacity: 50

CPUScalingPolicy:
  Type: AWS::ApplicationAutoScaling::ScalingPolicy
  Properties:
    PolicyType: TargetTrackingScaling
    TargetTrackingScalingPolicyConfiguration:
      PredefinedMetricSpecification:
        PredefinedMetricType: ECSServiceAverageCPUUtilization
      TargetValue: 70.0
      ScaleInCooldown: 300
      ScaleOutCooldown: 60
```

---

## EKS — Kubernetes en AWS

### Cuándo elegir EKS sobre ECS
```
EKS cuando:
  ✅ Ya tienes experiencia con Kubernetes
  ✅ Necesitas portabilidad entre clouds
  ✅ Tienes workloads complejos con helm charts, operators
  ✅ Necesitas Kubernetes-native features (Custom Resources, etc.)
  ✅ El equipo conoce kubectl y el ecosistema K8s

ECS cuando:
  ✅ El equipo conoce AWS pero no Kubernetes
  ✅ Quieres menos complejidad operacional
  ✅ Workloads más simples de microservicios
  ✅ Integración nativa con otros servicios AWS es prioritaria
```

### EKS — Add-ons esenciales
```bash
# Add-ons managed por AWS (se actualizan automáticamente)
eksctl create addon --name vpc-cni --cluster my-cluster
eksctl create addon --name coredns --cluster my-cluster
eksctl create addon --name kube-proxy --cluster my-cluster
eksctl create addon --name aws-ebs-csi-driver --cluster my-cluster

# Karpenter — auto provisioning de nodos (reemplaza Cluster Autoscaler)
helm install karpenter oci://public.ecr.aws/karpenter/karpenter \
  --version v0.33.0 --namespace karpenter --create-namespace

# AWS Load Balancer Controller
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  --namespace kube-system \
  --set clusterName=my-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller

# External Secrets Operator — sincronizar Secrets Manager → K8s Secrets
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets --create-namespace
```
