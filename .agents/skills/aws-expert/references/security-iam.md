# Observabilidad en AWS — CloudWatch, X-Ray, OpenTelemetry

## Los Tres Pilares de la Observabilidad

```
Métricas  → qué está pasando (números en el tiempo)
Logs      → por qué está pasando (eventos detallados)
Trazas    → cómo está pasando (flujo de una request a través del sistema)
```

---

## CloudWatch — Métricas y Alarmas

### Métricas personalizadas desde aplicación
```python
# Usando cloudwatch PutMetricData — o mejor, aws-lambda-powertools
import boto3

cloudwatch = boto3.client('cloudwatch')

# Publicar métrica de negocio
cloudwatch.put_metric_data(
    Namespace='OrderService',
    MetricData=[
        {
            'MetricName': 'OrdersProcessed',
            'Value': 1,
            'Unit': 'Count',
            'Dimensions': [
                {'Name': 'Environment', 'Value': 'prod'},
                {'Name': 'PaymentMethod', 'Value': 'credit_card'},
            ]
        },
        {
            'MetricName': 'OrderValue',
            'Value': 150.00,
            'Unit': 'None',
            'Dimensions': [{'Name': 'Environment', 'Value': 'prod'}]
        }
    ]
)
```

### Alarmas — configuración correcta
```yaml
# CloudFormation — Alarma con Anomaly Detection
HighErrorRateAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: "prod-order-service-5xx-rate"
    AlarmDescription: "5XX error rate above 1% for 5 consecutive minutes"
    Namespace: AWS/ApplicationELB
    MetricName: HTTPCode_Target_5XX_Count
    Dimensions:
      - Name: LoadBalancer
        Value: !GetAtt ALB.LoadBalancerFullName
    Statistic: Sum
    Period: 60          # 1 minuto de ventana
    EvaluationPeriods: 5 # 5 períodos consecutivos
    Threshold: 10
    ComparisonOperator: GreaterThanThreshold
    TreatMissingData: notBreaching
    AlarmActions: [!Ref PagerDutyTopic]    # alert de urgencia
    OKActions: [!Ref AlertsTopic]          # recuperación

# Alarma de Anomaly Detection — se adapta a patrones normales
LatencyAnomalyAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: "prod-api-latency-anomaly"
    Metrics:
      - Id: m1
        MetricStat:
          Metric:
            Namespace: AWS/ApplicationELB
            MetricName: TargetResponseTime
            Dimensions:
              - Name: LoadBalancer
                Value: !GetAtt ALB.LoadBalancerFullName
          Period: 60
          Stat: p99
      - Id: ad1
        Expression: ANOMALY_DETECTION_BAND(m1, 2)  # 2 desviaciones estándar
    ComparisonOperator: GreaterThanUpperThreshold
    ThresholdMetricId: ad1
    EvaluationPeriods: 3
    TreatMissingData: notBreaching
```

### CloudWatch Dashboard — las métricas que siempre quieres ver
```json
{
  "widgets": [
    // RED Metrics (Rate, Errors, Duration) — para cada servicio
    {"type": "metric", "properties": {"title": "Request Rate",
      "metrics": [["AWS/ApplicationELB", "RequestCount", "LoadBalancer", "..."]]}},
    {"type": "metric", "properties": {"title": "5XX Error Rate",
      "metrics": [["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "..."]]}},
    {"type": "metric", "properties": {"title": "p99 Latency",
      "metrics": [["AWS/ApplicationELB", "TargetResponseTime", "...", {"stat": "p99"}]]}},

    // USE Metrics (Utilization, Saturation, Errors) — para recursos
    {"type": "metric", "properties": {"title": "ECS CPU %",
      "metrics": [["AWS/ECS", "CPUUtilization", "ClusterName", "..."]]}},
    {"type": "metric", "properties": {"title": "RDS Connections",
      "metrics": [["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", "..."]]}},
    {"type": "metric", "properties": {"title": "SQS Queue Depth",
      "metrics": [["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", "..."]]}}
  ]
}
```

---

## CloudWatch Logs — Structured Logging

### Configuración de Log Groups
```yaml
# Log Groups con retención y cifrado
AppLogGroup:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: !Sub "/app/${AWS::StackName}/application"
    RetentionInDays: 90      # ajustar según compliance
    KmsKeyId: !Ref LogsKMSKey

# Subscription Filter → Kinesis → OpenSearch (para búsqueda avanzada)
LogSubscription:
  Type: AWS::Logs::SubscriptionFilter
  Properties:
    LogGroupName: !Ref AppLogGroup
    FilterPattern: "?ERROR ?WARN"   # solo logs con ERROR o WARN
    DestinationArn: !GetAtt KinesisStream.Arn
```

### CloudWatch Logs Insights — Queries útiles
```
# Top errores de los últimas 24 horas
fields @timestamp, @message
| filter @message like /ERROR/
| stats count(*) as error_count by bin(5m)
| sort error_count desc
| limit 20

# Latencia p99 de cada endpoint (API Gateway)
fields @timestamp, @requestId, @duration, resourcePath, status
| filter status >= 400
| stats pct(@duration, 99) as p99, count(*) as requests by resourcePath
| sort p99 desc

# Slow queries de RDS (PostgreSQL logs)
fields @timestamp, @message
| filter @message like /duration:/
| parse @message "duration: * ms" as duration_ms
| filter duration_ms > 1000
| stats count(*), avg(duration_ms), max(duration_ms) by bin(1h)

# Lambda cold starts
fields @timestamp, @requestId, @initDuration, @duration, @billedDuration
| filter ispresent(@initDuration)
| stats count(*) as cold_starts, avg(@initDuration) as avg_cold_start by bin(1h)
```

---

## AWS X-Ray — Distributed Tracing

### Instrumentación con Lambda Powertools
```python
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.utilities.typing import LambdaContext

tracer = Tracer(service="order-service")
logger = Logger(service="order-service")

@tracer.capture_lambda_handler
def handler(event: dict, context: LambdaContext) -> dict:
    order_id = event["orderId"]
    
    # Subsegmento para una operación específica
    with tracer.provider.in_subsegment("fetch-customer") as subsegment:
        customer = fetch_customer(order_id)
        subsegment.put_metadata("customer_id", customer["id"])
    
    return {"status": "processed", "orderId": order_id}

@tracer.capture_method
def fetch_customer(order_id: str) -> dict:
    # X-Ray captura automáticamente llamadas a DynamoDB, S3, etc.
    response = dynamodb_table.get_item(Key={"PK": f"ORDER#{order_id}"})
    return response.get("Item", {})
```

### X-Ray Groups y Sampling
```python
# Sampling rules — capturar el % correcto de trazas
# Producción: 5-10% para control de costos
# Error paths: 100% para no perder errores

# Definir en xray-sampling-rules.json:
{
  "version": 2,
  "rules": [
    {
      "description": "Health check — don't sample",
      "host": "*",
      "http_method": "GET",
      "url_path": "/health",
      "fixed_target": 0,
      "rate": 0
    },
    {
      "description": "High-value orders — always sample",
      "host": "*",
      "http_method": "POST",
      "url_path": "/orders",
      "fixed_target": 1,
      "rate": 1.0
    }
  ],
  "default": {
    "fixed_target": 1,
    "rate": 0.05    # 5% del tráfico normal
  }
}
```

---

## OpenTelemetry en AWS — El Estándar del Futuro

### AWS Distro for OpenTelemetry (ADOT)
```yaml
# ECS Task con ADOT Sidecar
containerDefinitions:
  - name: app
    image: myapp:latest
    environment:
      - name: OTEL_EXPORTER_OTLP_ENDPOINT
        value: http://localhost:4317  # ADOT collector sidecar

  - name: aws-otel-collector
    image: public.ecr.aws/aws-observability/aws-otel-collector:latest
    command: ["--config=/etc/ecs/ecs-default-config.yaml"]
    environment:
      - name: AWS_REGION
        value: us-east-1
    # El collector recibe traces de la app y los envía a X-Ray y/o managed Prometheus
```

### Container Insights — ECS/EKS
```bash
# Habilitar Container Insights en ECS cluster
aws ecs put-account-setting \
  --name containerInsights \
  --value enabled

# Container Insights provee automáticamente:
#   - CPU/Memoria/Network por task y container
#   - Métricas de GPU
#   - Log streaming
#   - Performance event analytics
# Costo: ~$0.50 por ECS task/mes adicional
```

---

## Alerting y On-Call

### Estructura de alertas
```
P1 — Critical:  servicio caído, pérdida de datos, impacto al 100% de usuarios
     Acción: PagerDuty → llamada inmediata al equipo de guardia
     SLA: responder en < 15 minutos

P2 — High:      degradación significativa, impacto al 25%+ de usuarios
     Acción: PagerDuty → notificación al equipo de guardia
     SLA: responder en < 1 hora

P3 — Medium:    anomalía detectada, sin impacto visible aún
     Acción: Slack #alerts → ticket creado automáticamente
     SLA: atender en horario laboral

P4 — Low:       sugerencia de optimización, ahorro de costos posible
     Acción: email semanal o ticket de backlog
     SLA: revisar en próximo sprint

Implementación en CloudWatch:
  P1 → SNS → PagerDuty webhook (severity=critical)
  P2 → SNS → PagerDuty webhook (severity=high)
  P3 → SNS → Lambda → Slack message + Jira ticket
  P4 → SNS → Email digest
```
