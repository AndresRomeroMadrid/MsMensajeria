# Bases de Datos en AWS — RDS, Aurora, DynamoDB, ElastiCache

## Elegir la Base de Datos Correcta

```
Patrón de acceso relacional (joins, transacciones ACID):
  OLTP general → Aurora MySQL/PostgreSQL Serverless v2
  Legacy MySQL/PostgreSQL → RDS Multi-AZ
  Microsoft SQL Server → RDS SQL Server

Patrón key-value / document (alta velocidad, escala):
  < 10ms latencia, escala automática → DynamoDB
  JSON flexible, MongoDB compatible → DocumentDB

Caché en memoria:
  Redis (estructuras de datos, pub/sub, streams) → ElastiCache for Redis
  Memcached (caché simple, horizontal scaling) → ElastiCache for Memcached

Analítico (OLAP, data warehouse):
  SQL sobre data lake → Athena (serverless, pago por query)
  Data warehouse gestionado → Redshift
  
Grafos:
  Relaciones entre entidades → Neptune (Gremlin / SPARQL)

Search:
  Full-text search, logs, métricas → OpenSearch Service
```

---

## Amazon Aurora — El Mejor RDS para la Mayoría

Aurora es compatible con MySQL y PostgreSQL pero con una arquitectura de almacenamiento propia que le da ventajas significativas sobre RDS estándar.

### Ventajas de Aurora vs RDS Standard
```
Almacenamiento:   auto-escala hasta 128TB (RDS: hasta 64TB, pre-provisioned)
Réplicas:         hasta 15 read replicas (RDS: 5)
Failover:         30 segundos (RDS: 1-2 minutos)
Backtrack:        rebobinar la base de datos en el tiempo (sin restaurar backup)
Global Database:  replicación cross-region < 1 segundo de lag
Costo:            20% más costoso que RDS estándar — justificado para producción
```

### Aurora Serverless v2 — La opción más flexible
```yaml
# CloudFormation — Aurora Serverless v2 Cluster
AuroraCluster:
  Type: AWS::RDS::DBCluster
  Properties:
    Engine: aurora-postgresql
    EngineVersion: "15.4"
    DatabaseName: !Ref DBName
    MasterUsername: !Sub "{{resolve:secretsmanager:${DBSecret}:SecretString:username}}"
    MasterUserPassword: !Sub "{{resolve:secretsmanager:${DBSecret}:SecretString:password}}"
    DBSubnetGroupName: !Ref DBSubnetGroup
    VpcSecurityGroupIds: [!Ref DBSecurityGroup]

    # Serverless v2 capacity — escala entre min y max ACUs automáticamente
    ServerlessV2ScalingConfiguration:
      MinCapacity: 0.5   # 0.5 ACU = ~1GB RAM — mínimo para escalar a 0 (dev/staging)
      MaxCapacity: 16    # 16 ACU = ~32GB RAM — ajustar según carga máxima

    StorageEncrypted: true
    KmsKeyId: !Ref RDSKMSKey
    BackupRetentionPeriod: 30
    DeletionProtection: true
    EnableCloudwatchLogsExports:
      - postgresql         # logs de slow queries y errores

# Writer instance (siempre necesaria)
AuroraWriterInstance:
  Type: AWS::RDS::DBInstance
  Properties:
    DBClusterIdentifier: !Ref AuroraCluster
    DBInstanceClass: db.serverless      # clase especial para Serverless v2
    Engine: aurora-postgresql

# Reader instance para lectura (opcional pero recomendado)
AuroraReaderInstance:
  Type: AWS::RDS::DBInstance
  Properties:
    DBClusterIdentifier: !Ref AuroraCluster
    DBInstanceClass: db.serverless
    Engine: aurora-postgresql
    PromotionTier: 1   # orden de failover (menor = primero en promover)
```

### RDS Proxy — para Lambda y alta concurrencia
```
Problema: Lambda puede crear cientos de conexiones simultáneas a RDS
          PostgreSQL soporta ~100-200 conexiones antes de degradarse

Solución: RDS Proxy — pool de conexiones managed entre Lambda y RDS
  - Reduce conexiones activas en el 80%+
  - Failover más rápido (30s → < 5s)
  - IAM Authentication (sin passwords en el código)
  - Costo: ~$0.015/vCPU/hora de la instancia RDS

Siempre usar RDS Proxy cuando:
  - Lambda conecta a RDS/Aurora
  - Microservicios con muchas instancias
  - ECS/EKS con alta concurrencia
```

---

## DynamoDB — Para Escala y Baja Latencia

### Diseño de tabla — todo depende del access pattern

DynamoDB no tiene esquema fijo, pero el diseño del Partition Key y Sort Key es crítico.

```
Single Table Design — el patrón correcto para DynamoDB:
  Una sola tabla para múltiples entidades de negocio
  Permite consultas eficientes con GSIs estratégicos

Ejemplo: E-commerce en una sola tabla

PK (Partition Key)  SK (Sort Key)       Datos                     Entidad
──────────────────  ──────────────────  ────────────────────────  ─────────
USER#u123           PROFILE             name, email, created_at   User
USER#u123           ORDER#o456          total, status, date        Order
USER#u123           ORDER#o789          total, status, date        Order
ORDER#o456          ITEM#i001           productId, qty, price      OrderItem
ORDER#o456          ITEM#i002           productId, qty, price      OrderItem
PRODUCT#p001        DETAILS             name, price, stock         Product
PRODUCT#p001        REVIEW#r001         userId, rating, text       Review

GSI1: SK=PK (invertir para queries por entidad relacionada)
  → Buscar todas las órdenes de un producto específico
GSI2: status-date-index (para queries por estado y rango de fechas)
  → Buscar órdenes pendientes de los últimos 7 días
```

### DynamoDB — configuración de producción
```python
# Python con boto3 — operaciones correctas
import boto3
from boto3.dynamodb.conditions import Key, Attr

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
table = dynamodb.Table('ecommerce')

# ✅ GetItem — recuperar un ítem específico (costo: 0.5 RCU)
response = table.get_item(
    Key={'PK': 'USER#u123', 'SK': 'PROFILE'},
    # ConsistentRead=True  # 1 RCU, necesario si necesitas strong consistency
)

# ✅ Query — consultar todos los ítems de una partición (eficiente)
response = table.query(
    KeyConditionExpression=Key('PK').eq('USER#u123') &
                           Key('SK').begins_with('ORDER#'),
    # FilterExpression=Attr('status').eq('PENDING'),  # se aplica DESPUÉS del query
    Limit=20,
    ScanIndexForward=False,    # orden descendente (más reciente primero)
)

# ✅ Transacciones — para operaciones atómicas (hasta 100 ítems, máx 4MB)
table.meta.client.transact_write(
    TransactItems=[
        {
            'Update': {
                'TableName': 'ecommerce',
                'Key': {'PK': 'PRODUCT#p001', 'SK': 'DETAILS'},
                'UpdateExpression': 'SET stock = stock - :qty',
                'ConditionExpression': 'stock >= :qty',   # falla si no hay stock
                'ExpressionAttributeValues': {':qty': 1},
            }
        },
        {
            'Put': {
                'TableName': 'ecommerce',
                'Item': {'PK': 'ORDER#o999', 'SK': 'ITEM#i001', ...},
            }
        }
    ]
)

# ❌ NUNCA usar Scan en producción (lee TODA la tabla)
# table.scan(...)  # O(n) - muy costoso
```

### DynamoDB — configuración de capacidad
```yaml
# On-Demand (recomendado para cargas variables)
BillingMode: PAY_PER_REQUEST
# Ventaja: escala automático, sin planificación de capacidad
# Costo: $1.25 por millón de WCU, $0.25 por millón de RCU

# Provisioned con Auto Scaling (para cargas predecibles — más económico)
BillingMode: PROVISIONED
ProvisionedThroughput:
  ReadCapacityUnits: 100
  WriteCapacityUnits: 50
# Configurar Application Auto Scaling para ajuste automático
```

---

## ElastiCache — Redis en Producción

### Cuándo usar Redis
```
✅ Caché de resultados de DB (reducir latencia y carga)
✅ Sesiones de usuario (web session store)
✅ Rate limiting (INCR + EXPIRE)
✅ Pub/Sub para mensajes real-time
✅ Leaderboards (Sorted Sets)
✅ Distributed locks (Redlock algorithm)
✅ Job queues (LPUSH/BRPOP)

Modos de despliegue:
  Cluster mode disabled: 1 shard, hasta 500GB, read replicas para HA
  Cluster mode enabled:  múltiples shards, escala horizontal infinita
```

### ElastiCache Redis — configuración segura
```yaml
RedisCluster:
  Type: AWS::ElastiCache::ReplicationGroup
  Properties:
    ReplicationGroupDescription: "Production Redis cluster"
    NumNodeGroups: 1                    # shards (1 = cluster mode disabled)
    ReplicasPerNodeGroup: 2             # 2 réplicas = 3 nodos total (HA)
    NodeGroupConfiguration:
      - PrimaryAvailabilityZone: us-east-1a
        ReplicaAvailabilityZones: [us-east-1b, us-east-1c]
    CacheNodeType: cache.r7g.large      # Graviton — mejor precio/perf
    Engine: redis
    EngineVersion: "7.1"
    AtRestEncryptionEnabled: true       # cifrado en reposo
    TransitEncryptionEnabled: true      # TLS en tránsito (auth token requerido)
    AuthToken: !Sub "{{resolve:secretsmanager:${RedisAuthSecret}}}"
    CacheSubnetGroupName: !Ref CacheSubnetGroup
    SecurityGroupIds: [!Ref RedisSecurityGroup]
    AutomaticFailoverEnabled: true      # failover automático
    MultiAZEnabled: true
    SnapshotRetentionLimit: 7
    SnapshotWindow: "05:00-06:00"       # backup diario
```
