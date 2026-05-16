# Serverless en AWS — Lambda, API Gateway, Step Functions

## API Gateway — Tipos y Cuándo Usar Cada Uno

```
HTTP API (recomendado para la mayoría de APIs REST):
  ✅ 70% más barato que REST API
  ✅ Menor latencia (~6ms vs ~10ms)
  ✅ JWT authorization nativo (Cognito, Auth0, etc.)
  ✅ Soporte para Lambda, HTTP backends, ECS
  ❌ Sin WAF directo (usar CloudFront + WAF delante)
  ❌ Sin API keys management
  Precio: $1.00 por millón de requests

REST API (cuando necesitas features avanzadas):
  ✅ WAF integrado
  ✅ API keys y usage plans
  ✅ Request/response transformation
  ✅ Caching nativo
  ✅ Stage variables
  Precio: $3.50 por millón de requests

WebSocket API:
  Para comunicación bidireccional en tiempo real
  Precio: $1.00 por millón de mensajes + $0.25 por millón de minutos conectados
```

### HTTP API + Lambda — configuración completa
```yaml
# SAM template (simplifica CloudFormation para serverless)
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Timeout: 30
    MemorySize: 512
    Runtime: python3.12
    Architectures: [arm64]
    Environment:
      Variables:
        POWERTOOLS_SERVICE_NAME: order-service
        LOG_LEVEL: INFO
    Layers:
      - !Sub arn:aws:lambda:${AWS::Region}:017000801446:layer:AWSLambdaPowertoolsPythonV2-Arm64:latest
    Tracing: Active   # X-Ray

  HttpApi:
    CorsConfiguration:
      AllowOrigins: ["https://myapp.com"]
      AllowHeaders: ["Content-Type", "Authorization"]
      AllowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    Auth:
      DefaultAuthorizer: JWTAuthorizer
      Authorizers:
        JWTAuthorizer:
          IdentitySource: $request.header.Authorization
          JwtConfiguration:
            Audience: [!Ref CognitoAppClientId]
            Issuer: !Sub "https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}"

Resources:
  OrdersApi:
    Type: AWS::Serverless::HttpApi
    Properties:
      StageName: v1
      AccessLogSettings:
        DestinationArn: !GetAtt ApiAccessLogs.Arn
        Format: '{"requestId":"$context.requestId","ip":"$context.identity.sourceIp","requestTime":"$context.requestTime","httpMethod":"$context.httpMethod","routeKey":"$context.routeKey","status":"$context.status","responseLength":"$context.responseLength","integrationLatency":"$context.integrationLatency"}'

  GetOrderFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: src/handlers/get_order.handler
      Description: Get order by ID
      Events:
        GetOrder:
          Type: HttpApi
          Properties:
            ApiId: !Ref OrdersApi
            Method: GET
            Path: /orders/{orderId}
      Policies:
        - DynamoDBReadPolicy:
            TableName: !Ref OrdersTable
        - AWSSecretsManagerGetSecretValuePolicy:
            SecretArn: !Ref DBSecret

  CreateOrderFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: src/handlers/create_order.handler
      ReservedConcurrentExecutions: 100   # evitar throttling en picos
      Events:
        CreateOrder:
          Type: HttpApi
          Properties:
            ApiId: !Ref OrdersApi
            Method: POST
            Path: /orders
      # DLQ para mensajes que fallan
      EventInvokeConfig:
        DestinationConfig:
          OnFailure:
            Type: SQS
            Destination: !GetAtt OrdersDLQ.Arn
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref OrdersTable
        - SQSSendMessagePolicy:
            QueueName: !GetAtt OrdersQueue.QueueName
```

---

## Step Functions — Orquestación de Workflows

### Cuándo usar Step Functions
```
✅ Workflows de varios pasos con lógica condicional
✅ Coordinación de microservicios con reintentos y compensaciones
✅ Procesos de larga duración (hasta 1 año con Standard, hasta 5 min con Express)
✅ Sagas para transacciones distribuidas
✅ ETL y procesamiento de datos paso a paso
✅ Human approval workflows (esperar aprobación manual)
```

### Standard vs Express Workflows
```
Standard Workflows:
  Duración: hasta 1 año
  Ejecución: exactly-once
  Auditoría: historial completo en Step Functions
  Precio: $0.025 por 1,000 transiciones de estado
  Uso: pedidos, aprobaciones, procesos de negocio

Express Workflows:
  Duración: hasta 5 minutos
  Ejecución: at-least-once
  Precio: $1 por millón de ejecuciones + duración
  Uso: procesos de alta frecuencia (eventos de IoT, streaming)
```

### Step Functions — ejemplo de Order Saga
```json
{
  "Comment": "Order processing saga with compensation",
  "StartAt": "ValidateOrder",
  "States": {
    "ValidateOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:validate-order",
      "Retry": [{
        "ErrorEquals": ["Lambda.ServiceException", "Lambda.AWSLambdaException"],
        "IntervalSeconds": 2,
        "MaxAttempts": 3,
        "BackoffRate": 2
      }],
      "Catch": [{
        "ErrorEquals": ["ValidationError"],
        "Next": "OrderFailed",
        "ResultPath": "$.error"
      }],
      "Next": "ReserveInventory"
    },

    "ReserveInventory": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:reserve-inventory",
      "Retry": [{"ErrorEquals": ["States.TaskFailed"], "MaxAttempts": 2}],
      "Catch": [{
        "ErrorEquals": ["OutOfStockError"],
        "Next": "OrderFailed",
        "ResultPath": "$.error"
      }],
      "Next": "ProcessPayment"
    },

    "ProcessPayment": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:process-payment",
      "Catch": [{
        "ErrorEquals": ["PaymentFailedError"],
        "Next": "ReleaseInventory",  // compensación
        "ResultPath": "$.error"
      }],
      "Next": "NotifyCustomer"
    },

    "ReleaseInventory": {
      "Type": "Task",
      "Comment": "Compensating transaction — release reserved inventory",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:release-inventory",
      "Next": "OrderFailed"
    },

    "NotifyCustomer": {
      "Type": "Task",
      "Resource": "arn:aws:states:::sns:publish",
      "Parameters": {
        "TopicArn": "arn:aws:sns:REGION:ACCOUNT:OrderNotifications",
        "Message.$": "States.Format('Order {} confirmed', $.orderId)"
      },
      "Next": "OrderComplete"
    },

    "OrderComplete": {
      "Type": "Succeed"
    },

    "OrderFailed": {
      "Type": "Fail",
      "Error": "OrderProcessingFailed",
      "Cause.$": "$.error.Cause"
    }
  }
}
```

---

## EventBridge — Event-Driven Architecture

### EventBridge vs SNS vs SQS
```
SQS:          Cola de mensajes — 1 productor, 1 consumidor
              Garantía de entrega, retry automático, DLQ
              Desacoplar productor de consumidor

SNS:          Pub/Sub — 1 productor, múltiples consumidores
              Fan-out: trigger múltiples SQSs, Lambdas, emails
              Sin filtros complejos

EventBridge:  Event bus — múltiples productores/consumidores
              Filtros avanzados por atributos del evento
              Schema registry — descubrimiento de eventos
              Pipe entre servicios AWS sin código
              Event archives — replay de eventos pasados
              Precio: $1 por millón de eventos

Patrón recomendado:
  Servicio → EventBridge → SQS → Lambda (consumidor)
  EventBridge filtra y enruta, SQS garantiza entrega y retry
```

### EventBridge Rule — ejemplo
```yaml
OrderCreatedRule:
  Type: AWS::Events::Rule
  Properties:
    EventBusName: !Ref AppEventBus
    EventPattern:
      source: ["order-service"]
      detail-type: ["OrderCreated"]
      detail:
        amount:
          numeric: [">=", 1000]    # solo órdenes grandes
    State: ENABLED
    Targets:
      - Id: NotifyFraudDetection
        Arn: !GetAtt FraudDetectionQueue.Arn
        DeadLetterConfig:
          Arn: !GetAtt EventsDLQ.Arn
        RetryPolicy:
          MaximumRetryAttempts: 3
          MaximumEventAgeInSeconds: 3600

      - Id: UpdateInventorySystem
        Arn: !GetAtt InventoryLambda.Arn
```

---

## Lambda — Casos de Uso Avanzados

### Lambda@Edge y CloudFront Functions
```
Lambda@Edge:
  Ejecuta en edge locations de CloudFront
  Acceso a request/response completo
  Runtime: Node.js, Python
  Latencia: ~1ms adicional
  Uso: A/B testing, autenticación, redirects complejos, header manipulation

CloudFront Functions:
  Más rápido (< 1ms) y más barato que Lambda@Edge
  Solo JavaScript
  Limitado: no puede llamar a APIs externas
  Uso: URL rewrites, header validation, simple redirects

# Ejemplo: CloudFront Function para security headers
function handler(event) {
  var response = event.response;
  var headers = response.headers;

  headers['strict-transport-security'] = {value: 'max-age=31536000; includeSubdomains; preload'};
  headers['x-content-type-options'] = {value: 'nosniff'};
  headers['x-frame-options'] = {value: 'DENY'};
  headers['x-xss-protection'] = {value: '1; mode=block'};
  headers['referrer-policy'] = {value: 'strict-origin-when-cross-origin'};
  headers['permissions-policy'] = {value: 'camera=(), microphone=(), geolocation=()'};

  return response;
}
```

### Lambda Power Tuning — optimizar memoria/costo
```bash
# Herramienta open source de AWS para encontrar la configuración óptima
# Prueba la función con distintas configuraciones de memoria
aws stepfunctions start-execution \
  --state-machine-arn arn:aws:states:us-east-1:ACCOUNT:stateMachine:powerTuningMachine \
  --input '{
    "lambdaARN": "arn:aws:lambda:us-east-1:ACCOUNT:function:my-function",
    "powerValues": [128, 256, 512, 1024, 2048, 3008],
    "num": 50,
    "payload": "{}",
    "parallelInvocation": true,
    "strategy": "cost"
  }'
# Resultado: gráfica de costo vs velocidad por configuración de memoria
```
