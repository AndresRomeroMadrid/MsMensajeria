# Optimización de Costos en AWS — FinOps

## Los 5 Pilares de FinOps en AWS

```
1. Visibilidad:    saber exactamente qué genera costos y por qué
2. Responsabilidad: asignar costos a equipos/productos (cost allocation tags)
3. Optimización:   eliminar desperdicio y comprar capacidad eficientemente
4. Agilidad:       la velocidad de gasto debe acompañar la velocidad de innovación
5. Cultura:        el costo es responsabilidad de todos, no solo de finanzas
```

---

## Visibilidad — Cost Explorer y Budgets

### Tagging Strategy — fundamental para visibilidad
```
Tags obligatorios en TODOS los recursos (enforced via SCP o Config):
  Environment:  prod | staging | dev
  Team:         platform | payments | catalog | data
  Product:      core | analytics | mobile-api
  CostCenter:   CC-001
  ManagedBy:    terraform | cloudformation | manual

SCPs para forzar tags en recursos críticos:
{
  "Condition": {
    "Null": {
      "aws:RequestTag/Environment": "true",
      "aws:RequestTag/Team": "true"
    }
  }
}
```

### AWS Budgets — alertas de costo
```yaml
# CloudFormation — Budget con alertas múltiples
MonthlyBudget:
  Type: AWS::Budgets::Budget
  Properties:
    Budget:
      BudgetName: monthly-total-cost
      BudgetType: COST
      TimeUnit: MONTHLY
      BudgetLimit:
        Amount: 10000
        Unit: USD
      CostFilters: {}
    NotificationsWithSubscribers:
      - Notification:
          NotificationType: ACTUAL
          ComparisonOperator: GREATER_THAN
          Threshold: 80    # Alertar al 80% del presupuesto
          ThresholdType: PERCENTAGE
        Subscribers:
          - SubscriptionType: EMAIL
            Address: infra-team@company.com
          - SubscriptionType: SNS
            Address: !Ref CostAlertTopic

      - Notification:
          NotificationType: FORECASTED    # Alerta por proyección
          ComparisonOperator: GREATER_THAN
          Threshold: 100
          ThresholdType: PERCENTAGE
        Subscribers:
          - SubscriptionType: EMAIL
            Address: cto@company.com
```

---

## Estrategias de Compra — Ahorrar en Cómputo

### Savings Plans vs Reserved Instances vs Spot

```
On-Demand:     precio completo, máxima flexibilidad
               Úsalo para: workloads imprevisibles, pruebas, picos

Savings Plans: compromiso de $ por hora durante 1 o 3 años
               Compute SP:   aplica a EC2, Fargate, Lambda (más flexible)
               EC2 Instance SP: aplica solo a EC2, mayor descuento
               Descuento: hasta 66% vs On-Demand
               Recomendación: cubrir el 70-80% de tu baseline con Savings Plans

Reserved Instances: compromiso de instancia específica, 1 o 3 años
               Standard RI:    mayor descuento (~72%), sin cambios
               Convertible RI: menor descuento (~66%), puedes cambiar tipo
               Recomendación: usar Savings Plans en su lugar (más flexibles)

Spot Instances: capacidad sobrante de EC2, hasta 90% de descuento
               Riesgo: pueden ser interrumpidas con 2 minutos de aviso
               Úsalos para: batch jobs, rendering, análisis de datos, CI/CD workers
               En ASG: mezcla On-Demand (20%) + Spot (80%) con múltiples tipos

Ejemplo de ahorro real:
  m6i.xlarge en us-east-1:
    On-Demand:     $0.192/hr  → $1,683/año
    Savings Plan:  $0.118/hr  → $1,034/año  (38% ahorro)
    1yr Reserved:  $0.121/hr  → $1,060/año  (37% ahorro)
    3yr Reserved:  $0.077/hr  →   $675/año  (60% ahorro)
    Spot:          ~$0.060/hr →   $526/año  (69% ahorro, con riesgo)
```

### Recomendaciones de Savings Plans
```python
# Leer recomendaciones de AWS Cost Explorer via CLI
aws ce get-savings-plans-purchase-recommendation \
  --savings-plans-type COMPUTE_SP \
  --term-in-years ONE_YEAR \
  --payment-option NO_UPFRONT \
  --lookback-period-in-days SIXTY_DAYS

# Regla: comprar SP para el 80% del baseline
# Baseline = el gasto mínimo de los últimos 90 días
# No comprar para picos — esos son On-Demand o Spot
```

---

## Rightsizing — Eliminar Desperdicio

### Señales de sobre-dimensionamiento
```
EC2:
  CPU promedio < 20% durante semanas → bajar 1-2 tamaños
  Memoria < 30% usada → bajar tipo de familia
  Network < 10% del límite → bajar throughput

RDS:
  CPU < 15% → bajar tipo de instancia
  Conexiones < 20% del máximo → bajar
  Storage autoscale no se ha activado → reducir storage inicial

Lambda:
  Memory usado < 50% del configurado → reducir memoria
  Duration < timeout/5 → reducir timeout

DynamoDB:
  Capacidad provisionada > 80% sin consumir → cambiar a On-Demand
  WCU/RCU consumidos < 20% → reducir o cambiar a On-Demand y comparar
```

### AWS Compute Optimizer
```bash
# Habilitar Compute Optimizer (gratis, genera recomendaciones en 14 días)
aws compute-optimizer update-enrollment-status --status Active

# Obtener recomendaciones de EC2
aws compute-optimizer get-ec2-instance-recommendations \
  --filters name=Finding,values=OVER_PROVISIONED \
  --query 'instanceRecommendations[].{Instance:instanceArn,CurrentType:currentInstanceType,RecommendedType:recommendationOptions[0].instanceType,EstimatedSaving:recommendationOptions[0].estimatedMonthlySavings.value}'
```

---

## Optimizaciones Específicas por Servicio

### S3 — Reducir Costos de Almacenamiento
```yaml
# Lifecycle Policy — mover datos al storage más económico
LifecycleConfiguration:
  Rules:
    - Id: IntelligentTieringForAll
      Status: Enabled
      Filter: {}
      Transitions:
        - Days: 0
          StorageClass: INTELLIGENT_TIERING   # mueve automáticamente entre tiers

    - Id: ArchiveAndDelete
      Status: Enabled
      Filter:
        Prefix: logs/
      Transitions:
        - Days: 30
          StorageClass: STANDARD_IA            # $0.0125/GB vs $0.023/GB Standard
        - Days: 90
          StorageClass: GLACIER_IR             # $0.004/GB, retrieval en minutos
        - Days: 365
          StorageClass: DEEP_ARCHIVE           # $0.00099/GB, retrieval en horas
      Expiration:
        Days: 2555    # eliminar logs de hace más de 7 años

# Clases de almacenamiento S3 y cuándo usar cada una:
# Standard:          acceso frecuente, primera copia
# Intelligent-Tiering: cuando el patrón de acceso es incierto (mueve automático)
# Standard-IA:       acceso < 1 vez/mes, retrieval rápido
# One Zone-IA:       datos reproducibles, ahorra 20% vs Standard-IA
# Glacier Instant:   archivos con retrieval < 5ms (backups activos)
# Glacier Flexible:  backups fríos, retrieval 1-5 horas
# Glacier Deep Archive: datos de compliance, retrieval 12 horas
```

### Data Transfer — El Costo Oculto
```
El egress (salida de datos de AWS) es uno de los costos más frecuentemente ignorados:

  EC2 → Internet:        $0.09/GB (primeros 10TB/mes)
  EC2 → EC2 diferente AZ: $0.02/GB (¡mismo precio en ambas direcciones!)
  EC2 → EC2 misma AZ:    GRATIS (usar la IP privada)
  EC2 → S3 misma región: GRATIS (con VPC Gateway Endpoint)
  EC2 → Internet via CloudFront: descuento CloudFront Origin Shield

Optimizaciones:
  1. VPC Gateway Endpoints para S3 y DynamoDB (GRATIS, reducen NAT GW)
  2. VPC Interface Endpoints para otros servicios (reduce costos de datos)
  3. Comprimir datos antes de transferir
  4. CloudFront para contenido estático (cachear = menos requests al origen)
  5. S3 Transfer Acceleration solo cuando es necesario (costo adicional)
  6. Usar IPs privadas entre servicios en la misma AZ
```

### Lambda — Optimizar Costo y Performance
```
Configuración óptima de memoria:
  Lambda Power Tuning Tool → encuentra el punto óptimo costo/rendimiento
  Regla general: más memoria = más CPU = ejecución más rápida = menos ms cobrados
  No siempre el menor precio por invocación es el menor costo total

Reducir invocaciones costosas:
  Caché en /tmp (vive entre invocaciones en caliente)
  ElastiCache para resultados frecuentes
  SQS Batching: procesar múltiples mensajes por invocación

Arquitectura:
  Evitar Lambda en loops de alta frecuencia → usar Fargate o EC2
  Para jobs batch: Step Functions con Batch o Fargate es más económico
  Lambda tiene cargo mínimo de 1ms — millones de microinvocaciones suman
```

---

## Dashboard de Costos — Qué Revisar Semanalmente

```
1. Top 10 servicios por costo este mes vs mes anterior
2. Costo por tag Environment (prod vs staging vs dev)
3. Transferencia de datos (egress)
4. Recursos sin tags (pueden ser huérfanos)
5. Savings Plans coverage report (objetivo: > 80% cobertura)
6. EC2 rightsizing recommendations (Compute Optimizer)
7. S3 storage lens → buckets que crecen sin lifecycle policy
8. RDS idle instances (CPU < 2% por semanas)
9. Elastic IPs no asociadas ($0.005/hr = $3.6/mes cada una)
10. NAT Gateway data transfer (candidato a VPC Endpoints)

Herramienta: AWS Cost Intelligence Dashboard (CID)
  CloudFormation template gratuito que despliega un dashboard en QuickSight
  con todas estas métricas y más: https://wellarchitectedlabs.com/cost/
```
