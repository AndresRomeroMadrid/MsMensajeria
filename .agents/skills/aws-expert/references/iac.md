# Infraestructura como Código — CloudFormation, CDK, Terraform

## Elegir la Herramienta Correcta

```
CloudFormation:
  ✅ Totalmente administrado por AWS, sin estado externo que gestionar
  ✅ Drift detection nativo
  ✅ Integración perfecta con todos los servicios AWS
  ❌ YAML/JSON verboso — difícil de abstraer y reutilizar
  ❌ Limitaciones en lógica condicional compleja
  Mejor para: equipos AWS-only, sin DevOps especializado

AWS CDK (Cloud Development Kit):
  ✅ Código real (TypeScript, Python, Java, Go) — lógica completa
  ✅ Constructs reutilizables — componentes de alto nivel
  ✅ Genera CloudFormation internamente — mismas garantías
  ✅ Type safety, IDE autocompletion, tests
  ❌ Requiere conocimiento del lenguaje elegido
  ❌ Versiones del CDK pueden traer cambios breaking
  Mejor para: equipos de desarrollo, abstracciones de alto nivel

Terraform:
  ✅ Multi-cloud (también azure, gcp, k8s, etc.)
  ✅ Ecosistema enorme de módulos (Terraform Registry)
  ✅ Plan explícito antes de apply (más control)
  ❌ Estado externo que gestionar (S3 + DynamoDB para locking)
  ❌ No es AWS-native — algunos recursos no disponibles hasta semanas después
  Mejor para: equipos multi-cloud, experiencia previa en Terraform
```

---

## AWS CDK — Guía Práctica

### Estructura de proyecto CDK recomendada
```
my-infrastructure/
├── bin/
│   └── app.ts              ← entry point, define los Stacks
├── lib/
│   ├── stacks/
│   │   ├── network-stack.ts     ← VPC, subnets, security groups
│   │   ├── database-stack.ts    ← RDS, ElastiCache
│   │   └── application-stack.ts ← ECS, ALB, Lambda
│   └── constructs/
│       ├── secure-bucket.ts     ← S3 con configuración segura por defecto
│       ├── ecs-service.ts       ← ECS Fargate service reutilizable
│       └── lambda-function.ts   ← Lambda con logging y tracing
├── test/
│   └── *.test.ts           ← tests con CDK assertions
├── cdk.json
└── package.json
```

### CDK Constructs — ejemplo de nivel L3
```typescript
// lib/constructs/secure-api.ts
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';

interface SecureApiProps {
  cluster: ecs.ICluster;
  containerImage: ecs.ContainerImage;
  containerPort: number;
  cpu: number;
  memoryLimitMiB: number;
  desiredCount: number;
  environment?: Record<string, string>;
  secrets?: Record<string, ecs.Secret>;
}

export class SecureApiConstruct extends Construct {
  public readonly service: ecs.FargateService;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;

  constructor(scope: Construct, id: string, props: SecureApiProps) {
    super(scope, id);

    // Log group con retención y cifrado
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Task Definition con configuración de seguridad
    const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: props.cpu,
      memoryLimitMiB: props.memoryLimitMiB,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.ARM64,  // Graviton
      },
    });

    taskDef.addContainer('App', {
      image: props.containerImage,
      portMappings: [{ containerPort: props.containerPort }],
      environment: props.environment,
      secrets: props.secrets,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'app',
        logGroup,
      }),
      healthCheck: {
        command: ['CMD-SHELL', `curl -f http://localhost:${props.containerPort}/health || exit 1`],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
      // Solo lectura del sistema de archivos
      readonlyRootFilesystem: true,
    });

    this.service = new ecs.FargateService(this, 'Service', {
      cluster: props.cluster,
      taskDefinition: taskDef,
      desiredCount: props.desiredCount,
      minHealthyPercent: 100,        // zero-downtime deploys
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true },  // rollback automático si el deploy falla
      enableExecuteCommand: false,    // SSM Execute Command (habilitar en dev)
    });

    // Auto Scaling
    const scaling = this.service.autoScaleTaskCount({
      minCapacity: props.desiredCount,
      maxCapacity: props.desiredCount * 10,
    });
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.minutes(5),
      scaleOutCooldown: cdk.Duration.minutes(1),
    });
  }
}
```

### CDK Testing — assertions
```typescript
// test/application-stack.test.ts
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { ApplicationStack } from '../lib/stacks/application-stack';

describe('ApplicationStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new ApplicationStack(app, 'TestStack', { env: { region: 'us-east-1' } });
    template = Template.fromStack(stack);
  });

  test('ECS Task is on Graviton (ARM64)', () => {
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      RuntimePlatform: {
        CpuArchitecture: 'ARM64',
        OperatingSystemFamily: 'LINUX',
      },
    });
  });

  test('No public subnets for ECS service', () => {
    template.hasResourceProperties('AWS::ECS::Service', {
      NetworkConfiguration: {
        AwsvpcConfiguration: {
          AssignPublicIp: 'DISABLED',
        },
      },
    });
  });

  test('Log group has retention policy', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 90,
    });
  });
});
```

---

## Terraform — Módulos y Mejores Prácticas para AWS

### Backend remoto con S3 + DynamoDB locking
```hcl
# backend.tf — SIEMPRE usar backend remoto en producción
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "my-terraform-state-bucket"
    key            = "prod/us-east-1/application/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "arn:aws:kms:us-east-1:ACCOUNT:key/KEY-ID"
    dynamodb_table = "terraform-state-lock"  # locking para evitar concurrent applies
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Environment = var.environment
      Project     = var.project_name
      ManagedBy   = "terraform"
    }
  }
}
```

### Módulo de VPC reutilizable
```hcl
# modules/vpc/main.tf
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.project}-${var.env}-vpc"
  cidr = var.vpc_cidr

  azs              = data.aws_availability_zones.available.names
  private_subnets  = [for k, v in local.azs : cidrsubnet(var.vpc_cidr, 4, k)]
  public_subnets   = [for k, v in local.azs : cidrsubnet(var.vpc_cidr, 8, k + 48)]
  database_subnets = [for k, v in local.azs : cidrsubnet(var.vpc_cidr, 8, k + 52)]

  enable_nat_gateway     = true
  single_nat_gateway     = var.env != "prod"  # multi-NAT solo en prod
  enable_vpn_gateway     = false
  enable_dns_hostnames   = true
  enable_dns_support     = true

  # VPC Flow Logs
  enable_flow_log                      = true
  create_flow_log_cloudwatch_log_group = true
  create_flow_log_cloudwatch_iam_role  = true
  flow_log_max_aggregation_interval    = 60

  # Tags para EKS (si aplica)
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = 1
  }
  public_subnet_tags = {
    "kubernetes.io/role/elb" = 1
  }
}
```

### Estructura de repositorio Terraform
```
infrastructure/
├── modules/           ← módulos reutilizables
│   ├── vpc/
│   ├── ecs-service/
│   ├── rds-aurora/
│   └── lambda/
├── environments/
│   ├── dev/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── terraform.tfvars
│   ├── staging/
│   └── prod/
│       ├── main.tf
│       ├── variables.tf
│       └── terraform.tfvars   ← NUNCA commitear secretos aquí
└── global/           ← recursos globales (IAM, Route53, ACM)
    ├── iam/
    └── dns/
```

---

## CloudFormation — Patrones Avanzados

### Nested Stacks y StackSets
```yaml
# Stack raíz que orquesta nested stacks
NetworkingStack:
  Type: AWS::CloudFormation::Stack
  Properties:
    TemplateURL: !Sub "https://s3.amazonaws.com/${ArtifactBucket}/networking.yaml"
    Parameters:
      VpcCidr: 10.0.0.0/16
      Environment: !Ref Environment
    Tags:
      - Key: Layer
        Value: networking

DatabaseStack:
  Type: AWS::CloudFormation::Stack
  DependsOn: NetworkingStack
  Properties:
    TemplateURL: !Sub "https://s3.amazonaws.com/${ArtifactBucket}/database.yaml"
    Parameters:
      VpcId: !GetAtt NetworkingStack.Outputs.VpcId
      SubnetIds: !GetAtt NetworkingStack.Outputs.PrivateSubnetIds
```

### Helpers de CloudFormation útiles
```yaml
# Condiciones
Conditions:
  IsProduction: !Equals [!Ref Environment, prod]
  IsMultiAZ: !Or [!Condition IsProduction, !Equals [!Ref Environment, staging]]

# Usar condiciones
RDSInstance:
  Type: AWS::RDS::DBInstance
  Properties:
    MultiAZ: !If [IsMultiAZ, true, false]
    DeletionProtection: !If [IsProduction, true, false]
    BackupRetentionPeriod: !If [IsProduction, 30, 7]

# Mappings para configuración por región/entorno
Mappings:
  EnvironmentConfig:
    prod:
      InstanceType: m6i.xlarge
      MinSize: 3
    staging:
      InstanceType: t3.medium
      MinSize: 1
    dev:
      InstanceType: t3.small
      MinSize: 1

# Usar mapping
InstanceType: !FindInMap [EnvironmentConfig, !Ref Environment, InstanceType]
```
