# Data y Analytics en AWS — Glue, Athena, Kinesis, Redshift

## Arquitectura de Data Lake Moderna

```
Ingesta → Almacenamiento (S3) → Catálogo (Glue) → Consumo (Athena/Redshift/QuickSight)

Capas del Data Lake (Medallion Architecture):
  Bronze (Raw):    datos originales tal como llegan, inmutables
  Silver (Curated): datos limpios, tipados, en Parquet
  Gold (Analytics): tablas de negocio agregadas, optimizadas para consulta
```

---

## Kinesis — Streaming de Datos en Tiempo Real

### Kinesis Data Streams vs Kinesis Firehose vs MSK

```
Kinesis Data Streams:
  ✅ Latencia: < 1 segundo
  ✅ Retención: 1-365 días
  ✅ Múltiples consumidores (Lambda, KCL, Analytics)
  ✅ Replay de datos (reprocesar)
  ❌ Requiere gestión de shards y consumidores
  Caso de uso: eventos en tiempo real, clickstream, IoT

Kinesis Data Firehose:
  ✅ Totalmente managed (sin código de consumidor)
  ✅ Entrega a S3, Redshift, OpenSearch, Splunk
  ✅ Transformación con Lambda
  ❌ Latencia mínima ~60 segundos
  ❌ Sin replay
  Caso de uso: ingestión de logs, ETL simple hacia S3/Redshift

Amazon MSK (Managed Kafka):
  ✅ Kafka compatible — migración sin cambio de código
  ✅ Ecosistema Kafka (Kafka Connect, Streams, KSQL)
  ✅ Hasta 200MB/s por broker
  ❌ Más complejo de operar que Kinesis
  Caso de uso: cuando ya tienes Kafka, ecosistema Kafka existente
```

### Kinesis Data Streams — configuración
```python
import boto3
import json
import hashlib

kinesis = boto3.client('kinesis', region_name='us-east-1')

# Producir eventos
def publish_order_event(order: dict) -> None:
    kinesis.put_record(
        StreamName='order-events',
        Data=json.dumps(order).encode('utf-8'),
        # Partition key determina el shard — usar un ID de negocio para ordering
        PartitionKey=order['orderId'],
    )

# Publicar en batch (hasta 500 records o 5MB por batch)
def publish_events_batch(events: list) -> None:
    records = [
        {
            'Data': json.dumps(event).encode('utf-8'),
            'PartitionKey': event.get('userId', 'default'),
        }
        for event in events
    ]

    response = kinesis.put_records(
        StreamName='order-events',
        Records=records,
    )

    # Verificar registros fallidos y reintentar
    failed = response.get('FailedRecordCount', 0)
    if failed > 0:
        failed_records = [
            records[i] for i, r in enumerate(response['Records'])
            if 'ErrorCode' in r
        ]
        # Retry con backoff exponencial
        kinesis.put_records(StreamName='order-events', Records=failed_records)
```

### Lambda procesando Kinesis — configuración correcta
```yaml
KinesisProcessorFunction:
  Type: AWS::Serverless::Function
  Properties:
    Handler: src/handlers/kinesis_processor.handler
    Events:
      KinesisStream:
        Type: Kinesis
        Properties:
          Stream: !GetAtt OrderEventsStream.Arn
          StartingPosition: LATEST
          BatchSize: 100              # hasta 100 records por invocación
          MaximumBatchingWindowInSeconds: 5  # esperar hasta 5s para batch completo
          ParallelizationFactor: 4    # 4 Lambda por shard (paralelo)
          BisectBatchOnFunctionError: true   # si falla, dividir batch y reintentar
          DestinationConfig:
            OnFailure:
              Destination: !GetAtt KinesisDLQ.Arn
          MaximumRetryAttempts: 3
          MaximumRecordAgeInSeconds: 3600    # descartar records de hace más de 1 hora
          FilterCriteria:
            Filters:
              - Pattern: '{"data": {"eventType": ["OrderCreated", "OrderUpdated"]}}'
```

---

## AWS Glue — ETL Serverless

### Cuándo usar Glue vs EMR vs Lambda para ETL
```
Glue (serverless):
  ✅ Sin gestión de cluster
  ✅ Data Catalog integrado
  ✅ DPU (compute) por hora, solo cuando corre
  ❌ Cold start de 2-10 minutos
  Usar para: ETL batch diario/semanal, transformaciones de Spark

EMR (managed Hadoop/Spark):
  ✅ Más rápido para jobs muy grandes (sin cold start)
  ✅ Control total de Spark, Hive, Presto
  ✅ Spot instances para reducir costo 80%
  ❌ Debes gestionar el cluster (aunque es managed)
  Usar para: data engineering a escala (TB/PB), procesamiento continuo

Lambda (FaaS):
  ✅ Muy barato para transformaciones simples
  ✅ Sin gestión de infraestructura
  ❌ Límite de 15 min, 10GB RAM, 10GB /tmp
  Usar para: transformaciones simples, single record processing, Firehose transform
```

### Glue Job — ejemplo de transformación
```python
# Glue PySpark job — transformar CSV a Parquet con esquema
import sys
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job
from awsglue.dynamicframe import DynamicFrame
from pyspark.sql import functions as F

args = getResolvedOptions(sys.argv, ['JOB_NAME', 'source_path', 'target_path'])

sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)
job.init(args['JOB_NAME'], args)

# Leer desde S3 Raw (Bronze)
raw_dyf = glueContext.create_dynamic_frame.from_options(
    connection_type="s3",
    connection_options={"paths": [args['source_path']]},
    format="csv",
    format_options={"withHeader": True, "separator": ","},
)

# Transformar con Spark
df = raw_dyf.toDF()

curated_df = (df
    .filter(F.col("order_id").isNotNull())
    .withColumn("created_at", F.to_timestamp("created_at", "yyyy-MM-dd HH:mm:ss"))
    .withColumn("total_amount", F.col("total_amount").cast("decimal(15,2)"))
    .withColumn("year",  F.year("created_at"))
    .withColumn("month", F.month("created_at"))
    .withColumn("day",   F.dayofmonth("created_at"))
    .dropDuplicates(["order_id"])
)

# Escribir a S3 Curated (Silver) en Parquet particionado
curated_dyf = DynamicFrame.fromDF(curated_df, glueContext, "curated")
glueContext.write_dynamic_frame.from_options(
    frame=curated_dyf,
    connection_type="s3",
    connection_options={
        "path": args['target_path'],
        "partitionKeys": ["year", "month", "day"],
    },
    format="glueparquet",
    format_options={"compression": "snappy"},
)

job.commit()
```

---

## Amazon Athena — SQL sobre S3

### Optimización de costos en Athena
```
Athena cobra $5 por TB de datos escaneados.
La optimización más importante es reducir el scan.

1. Formato Parquet (columnar) → 10-100x menos scan que CSV
2. Particionamiento → WHERE year=2024 AND month=01 escanea solo esos datos
3. Compresión (Snappy/Zstd) → reduce tamaño sin sacrificar velocidad
4. Columnas proyectadas → SELECT solo las columnas necesarias

Ejemplo de ahorro:
  Tabla de 10GB en CSV → $0.05 por query (todo escanea)
  Misma tabla en Parquet, particionada, comprimida → $0.001 por query (~50x ahorro)
```

### Athena — queries eficientes
```sql
-- ✅ Con particionamiento y columnas específicas
SELECT
    order_id,
    customer_id,
    total_amount,
    status
FROM orders
WHERE
    year = 2024           -- usa particionamiento
    AND month = 1
    AND status = 'COMPLETED'
    AND total_amount > 100
ORDER BY total_amount DESC
LIMIT 100;

-- ✅ Crear tabla con particionamiento correcto
CREATE EXTERNAL TABLE IF NOT EXISTS orders (
    order_id      STRING,
    customer_id   STRING,
    total_amount  DECIMAL(15,2),
    status        STRING
)
PARTITIONED BY (
    year  INT,
    month INT,
    day   INT
)
STORED AS PARQUET
LOCATION 's3://my-data-lake/curated/orders/'
TBLPROPERTIES ('parquet.compress'='SNAPPY');

-- Cargar particiones (o usar MSCK REPAIR TABLE)
ALTER TABLE orders ADD IF NOT EXISTS
PARTITION (year=2024, month=1, day=15)
LOCATION 's3://my-data-lake/curated/orders/year=2024/month=1/day=15/';
```

---

## Amazon Redshift — Data Warehouse

### Cuándo Redshift vs Athena
```
Athena (serverless):
  ✅ Sin cluster, paga por query
  ✅ Ideal para consultas ad-hoc, exploración
  ✅ Soporta múltiples formatos (JSON, CSV, Parquet, ORC)
  ❌ No tan rápido para análisis complejos con joins grandes
  ❌ Sin caché de resultados por defecto

Redshift:
  ✅ Queries analíticos de alta complejidad muy rápidos
  ✅ Concurrencia scaling automático
  ✅ ML integrado (Redshift ML con SageMaker)
  ✅ Federated queries (RDS, S3)
  ❌ Costo de cluster ($0.25/nodo/hora para ra3.xlplus)
  ❌ Gestión del cluster, vacuum, analyze

Redshift Serverless:
  ✅ Sin gestión de cluster
  ✅ Escala automático (0 cuando no se usa)
  Precio: $0.36/RPU-hora
  Ideal para: uso intermitente, equipos que no quieren gestionar Redshift
```

### Redshift — mejores prácticas de rendimiento
```sql
-- Distribution style — cómo distribuir datos en nodos
-- KEY: distribuir por columna de join frecuente (evita movimiento de datos)
CREATE TABLE orders (
    order_id    BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,
    total       DECIMAL(15,2)
)
DISTKEY(customer_id)     -- distribuir en el nodo por customer_id
SORTKEY(created_at);     -- ordenar por fecha para range queries

-- EVEN: distribución round-robin (para tablas sin patrón claro)
-- ALL: replicar en todos los nodos (para tablas de dimensión pequeñas)
CREATE TABLE products (...)
DISTSTYLE ALL;           -- tabla pequeña → replicar en todos los nodos

-- Compound vs Interleaved Sort Keys
SORTKEY(year, month, day)        -- compound: eficiente para filtros en orden
INTERLEAVED SORTKEY(region, category, date)  -- interleaved: múltiples columnas de filtro
```
