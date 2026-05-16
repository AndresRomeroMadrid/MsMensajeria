# Almacenamiento en AWS — S3, EBS, EFS, FSx

## S3 — Object Storage

### S3 Bucket — Configuración segura por defecto
```yaml
SecureBucket:
  Type: AWS::S3::Bucket
  Properties:
    BucketName: !Sub "${AWS::AccountId}-${AWS::Region}-my-bucket"
    # Siempre bloquear acceso público a menos que sea intencional
    PublicAccessBlockConfiguration:
      BlockPublicAcls: true
      BlockPublicPolicy: true
      IgnorePublicAcls: true
      RestrictPublicBuckets: true
    # Cifrado con KMS
    BucketEncryption:
      ServerSideEncryptionConfiguration:
        - ServerSideEncryptionByDefault:
            SSEAlgorithm: aws:kms
            KMSMasterKeyID: !Ref S3KMSKey
          BucketKeyEnabled: true   # reduce costos de KMS hasta 99%
    # Versionado (habilitar siempre para datos críticos)
    VersioningConfiguration:
      Status: Enabled
    # Replication cross-region (para DR)
    ReplicationConfiguration:
      Role: !GetAtt ReplicationRole.Arn
      Rules:
        - Status: Enabled
          Destination:
            Bucket: !Sub "arn:aws:s3:::${AWS::AccountId}-us-west-2-my-bucket"
            ReplicationTime:
              Status: Enabled
              Time: Minutes: 15      # S3 RTC: replicación en < 15 minutos garantizado
            Metrics:
              Status: Enabled
    # Access Logging
    LoggingConfiguration:
      DestinationBucketName: !Ref LogsBucket
      LogFilePrefix: s3-access/my-bucket/
    # Notificaciones de eventos
    NotificationConfiguration:
      EventBridgeConfiguration:
        EventBridgeEnabled: true  # enviar todos los eventos a EventBridge
    # Object Lock (compliance — immutable objects)
    ObjectLockEnabled: false  # habilitar solo para compliance/regulatory
    # Accelerate Transfer
    AccelerateConfiguration:
      AccelerationStatus: Suspended  # habilitar solo si se necesita

BucketPolicy:
  Type: AWS::S3::BucketPolicy
  Properties:
    Bucket: !Ref SecureBucket
    PolicyDocument:
      Statement:
        # Forzar HTTPS
        - Sid: DenyHTTP
          Effect: Deny
          Principal: "*"
          Action: "s3:*"
          Resource:
            - !GetAtt SecureBucket.Arn
            - !Sub "${SecureBucket.Arn}/*"
          Condition:
            Bool:
              "aws:SecureTransport": false
        # Forzar cifrado en upload
        - Sid: DenyUnencryptedUploads
          Effect: Deny
          Principal: "*"
          Action: "s3:PutObject"
          Resource: !Sub "${SecureBucket.Arn}/*"
          Condition:
            StringNotEquals:
              "s3:x-amz-server-side-encryption": "aws:kms"
```

### S3 — URLs presignadas para acceso privado
```python
import boto3
from datetime import timedelta

s3 = boto3.client('s3')

# Generar URL presignada para GET (descarga) — expira en 1 hora
def generate_download_url(bucket: str, key: str, expires_in: int = 3600) -> str:
    return s3.generate_presigned_url(
        'get_object',
        Params={'Bucket': bucket, 'Key': key},
        ExpiresIn=expires_in,
    )

# Generar URL presignada para PUT (upload directo desde browser)
def generate_upload_url(bucket: str, key: str, content_type: str) -> dict:
    return s3.generate_presigned_post(
        Bucket=bucket,
        Key=key,
        Fields={"Content-Type": content_type},
        Conditions=[
            {"Content-Type": content_type},
            ["content-length-range", 1, 10_000_000],  # máx 10MB
        ],
        ExpiresIn=3600,
    )
    # El cliente hace POST directamente a S3 con los campos retornados
    # Evita hacer pasar el archivo por el servidor
```

---

## EBS — Elastic Block Store

### Tipos de volumen y cuándo usar cada uno
```
gp3 (General Purpose SSD) — el default correcto para la mayoría:
  IOPS: 3,000 baseline (configurable hasta 16,000 sin costo adicional de storage)
  Throughput: 125 MB/s baseline (configurable hasta 1,000 MB/s)
  Costo: $0.08/GB/mes
  Usar para: OS, apps web, bases de datos de desarrollo

io2 Block Express (Provisioned IOPS) — solo para bases de datos críticas:
  IOPS: hasta 256,000 IOPS
  Latencia: sub-milisegundo consistente
  Costo: $0.125/GB + $0.065 por IOPS
  Usar para: SQL Server, Oracle, SAP HANA, cargas I/O intensivas

st1 (Throughput Optimized HDD) — para datos fríos de alto volumen:
  Throughput: hasta 500 MB/s
  Costo: $0.045/GB (casi la mitad que gp3)
  Usar para: data warehouses locales, logs de alto volumen, Kafka

sc1 (Cold HDD) — el más barato, para archivos raramente accedidos:
  Throughput: hasta 250 MB/s
  Costo: $0.015/GB
  Usar para: backups fríos, datos de compliance

Reglas:
  ✅ Siempre usar gp3 en lugar de gp2 (mismo precio, mejor performance)
  ✅ Habilitar Multi-Attach solo con io2 y sistemas de archivos compatibles (cluster)
  ✅ Snapshots automáticos con Amazon Data Lifecycle Manager
  ✅ Cifrado habilitado en todos los volúmenes de producción
```

### EBS Snapshots — automatizar con DLM
```yaml
EBSLifecyclePolicy:
  Type: AWS::DLM::LifecyclePolicy
  Properties:
    State: ENABLED
    Description: Daily snapshots retained for 30 days
    ExecutionRoleArn: !GetAtt DLMRole.Arn
    PolicyDetails:
      ResourceTypes: [VOLUME]
      TargetTags:
        - Key: Backup
          Value: daily
      Schedules:
        - Name: DailySnapshots
          CreateRule:
            IntervalUnit: HOURS
            Interval: 24
            Times: ["03:00"]
          RetainRule:
            Count: 30
          CopyTags: true
          CrossRegionCopyRules:
            - TargetRegion: us-west-2
              Encrypted: true
              RetainRule:
                Interval: 7
                IntervalUnit: DAYS
```

---

## EFS — Elastic File System (NFS)

### Cuándo usar EFS
```
✅ Contenido compartido entre múltiples instancias EC2 / contenedores ECS
✅ Home directories de usuarios
✅ Código de aplicación compartido (CMS, web servers)
✅ Machine learning training data
✅ Backup de workloads que necesitan NFS

❌ No usar para: bases de datos (usar EBS io2), latencia sub-ms requerida

Performance Modes:
  General Purpose: la mayoría de workloads (default)
  Max I/O:         big data, media processing (mayor latencia, mayor throughput)

Throughput Modes:
  Bursting:       throughput escala con el tamaño del filesystem
  Provisioned:    throughput fijo independiente del tamaño
  Elastic:        escala automático según la carga (recomendado para la mayoría)

Storage Classes:
  Standard:       datos de acceso frecuente
  IA (Infrequent Access): datos raramente accedidos ($0.016/GB vs $0.30/GB Standard)

Lifecycle Policy:
  Mover a IA después de 30 días sin acceso → reduce costos hasta 90%
```

---

## AWS Backup — Centralizar Backups

```yaml
BackupPlan:
  Type: AWS::Backup::BackupPlan
  Properties:
    BackupPlan:
      BackupPlanName: production-backup-plan
      Rules:
        - RuleName: DailyBackups
          TargetBackupVault: !Ref BackupVault
          ScheduleExpression: "cron(0 5 ? * * *)"    # 5 AM UTC diario
          StartWindowMinutes: 60
          CompletionWindowMinutes: 180
          Lifecycle:
            DeleteAfterDays: 35
          CopyActions:
            - DestinationBackupVaultArn: !Sub "arn:aws:backup:us-west-2:${AWS::AccountId}:backup-vault:dr-vault"
              Lifecycle:
                DeleteAfterDays: 35

        - RuleName: MonthlyBackups
          TargetBackupVault: !Ref BackupVault
          ScheduleExpression: "cron(0 5 1 * ? *)"    # 1ro de cada mes
          Lifecycle:
            DeleteAfterDays: 365

# Aplicar el plan a todos los recursos con tag Backup=true
BackupSelection:
  Type: AWS::Backup::BackupSelection
  Properties:
    BackupPlanId: !Ref BackupPlan
    BackupSelection:
      SelectionName: tagged-resources
      IamRoleArn: !GetAtt BackupRole.Arn
      ListOfTags:
        - ConditionType: STRINGEQUALS
          ConditionKey: Backup
          ConditionValue: "true"
```
