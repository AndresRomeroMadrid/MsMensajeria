# Microservicio de Comunicaciones / Mensajeria

Microservicio Node.js + TypeScript para gestionar comunicaciones internas del sistema Libro de Clases V3. Expone una API REST protegida con JWT para enviar mensajes, consultar bandejas de entrada/salida, marcar mensajes como leidos y descargar archivos adjuntos. Ademas corre en segundo plano un consumidor de eventos de "gestion de notas" que envia notificaciones por email.

El servicio persiste los mensajes en PostgreSQL, almacena adjuntos en disco mediante Multer y puede enviar notificaciones externas por email (SMTP via Nodemailer) y Telegram cuando el cliente lo solicita. Se despliega como imagen Docker sobre **AWS ECS con Fargate** (task de larga duracion, sin servidores que administrar).

## Stack principal

- Runtime: Node.js 22 en Docker, compatible con Node.js 18+ en desarrollo local.
- Framework HTTP: Express 5.
- Lenguaje: TypeScript con `strict` habilitado.
- Gestor de paquetes: pnpm (lockfile `pnpm-lock.yaml`, `corepack enable` en Docker).
- Base de datos: PostgreSQL mediante `pg`.
- Archivos adjuntos: Multer con almacenamiento local (disco del contenedor).
- Autenticacion: JWT (`jsonwebtoken`), validado en middleware sobre toda la API salvo `/health`.
- Notificaciones: email vía SMTP con Nodemailer y Telegram Bot API.
- Mensajeria asincrona: consumidor de eventos "gestion" con doble backend, RabbitMQ (`amqplib`) en desarrollo o AWS SQS (`@aws-sdk/client-sqs`) en produccion, segun `ENVIRONMENT`.
- Testing: Vitest (`test/unit`), con cobertura v8 y umbral minimo de 70% de lineas.
- Contenedores: Docker multi-stage basado en `node:22-alpine3.20`.
- CI/CD: GitHub Actions corre tests con cobertura y luego construye/publica la imagen en Docker Hub.
- Despliegue: AWS ECS, launch type **Fargate**, ejecutando la imagen publicada como task de larga duracion (API + consumidor en el mismo proceso).

## Estructura del proyecto

```text
MsMensajeria/
├── .github/
│   └── workflows/
│       └── deploy.yaml          # CI: tests + build/push de la imagen Docker
├── src/
│   ├── config/                  # Configuracion transversal: pool de PostgreSQL y storage de Multer
│   ├── consumers/                # Consumidor del evento "gestion de notas" (RabbitMQ / SQS)
│   │   ├── gestion.consumer.ts       # Punto de entrada: elige backend segun ENVIRONMENT
│   │   └── gestion.sqs.consumer.ts   # Long polling contra AWS SQS (ENVIRONMENT=prod)
│   ├── controllers/              # Casos HTTP: validan flujo, consultan DB y responden
│   ├── middlewares/
│   │   └── auth.middleware.ts    # Verificacion de JWT (Bearer token)
│   ├── models/                   # Interfaces de dominio
│   ├── routes/                   # Definicion de endpoints Express
│   ├── services/                 # Integraciones externas: email (Nodemailer) y Telegram
│   ├── utils/                    # Utilidades puras reutilizables
│   ├── app.ts                    # App Express, middlewares, rutas y health check
│   └── index.ts                  # Bootstrap del servidor HTTP + arranque del consumidor
├── test/
│   └── unit/                     # Pruebas unitarias con Vitest (controllers, services, consumers, utils)
├── Dockerfile                    # Build multi-stage (pnpm) para produccion
├── .dockerignore                 # Excluye node_modules, dist, coverage, .git, .env, test
├── env.example                   # Plantilla de variables de entorno
├── package.json                  # Scripts y dependencias (pnpm)
├── pnpm-lock.yaml                # Lockfile de pnpm
├── tsconfig.json                 # Compilacion TypeScript a `dist/`
└── vitest.config.ts              # Configuracion de pruebas y cobertura
```

## Arquetipo y patrones usados

El proyecto sigue un arquetipo simple de API REST por capas, mas un proceso de consumo de eventos que corre dentro del mismo contenedor:

- `routes`: declara la superficie HTTP y compone middlewares, por ejemplo `upload.single('archivo')`.
- `middlewares`: `auth.middleware.ts` valida el JWT recibido en `Authorization: Bearer <token>` antes de llegar a cualquier ruta bajo `/api/mensajes`.
- `controllers`: orquesta la peticion, ejecuta consultas SQL, invoca servicios externos y define la respuesta HTTP.
- `services`: encapsula integraciones con terceros, como el envio de email por SMTP y las notificaciones de Telegram.
- `consumers`: procesa eventos de "gestion de notas" publicados por otro microservicio. `gestion.consumer.ts` decide en runtime si escucha RabbitMQ o delega en `gestion.sqs.consumer.ts` (SQS), segun la variable `ENVIRONMENT`. Por cada mensaje recibido, envia un email a cada destinatario y confirma (ack / delete) al finalizar.
- `config`: centraliza infraestructura local del proceso, como el pool de PostgreSQL y el storage de Multer.
- `utils`: contiene funciones puras sin dependencia de Express ni de infraestructura.

Los mensajes masivos se resuelven desde el controlador cuando `quien_recibe` usa el formato `GROUP:PROFESORES` o `GROUP:ESTUDIANTES`. En esos casos se consultan usuarios activos por `rol_id` y se inserta un mensaje por destinatario.

El servidor HTTP y el consumidor de eventos arrancan en el mismo proceso Node (`src/index.ts`), por lo que el contenedor/task debe permanecer siempre corriendo (no es apto para ejecucion tipo batch/cron).

## Autenticacion

Todas las rutas bajo `/api/mensajes` requieren un JWT valido enviado como:

```
Authorization: Bearer <token>
```

El middleware `verifyToken` (`src/middlewares/auth.middleware.ts`) valida la firma con `JWT_SECRET` y adjunta el payload decodificado a `req.user`. El unico endpoint sin autenticacion es `GET /health`, usado por Docker/ECS para health checks.

Respuestas de error:

- `401` si falta el header, no tiene formato `Bearer <token>`, o el token es invalido/expirado.
- `500` si `JWT_SECRET` no esta configurado en el entorno.

## Consumidor de eventos "gestion de notas"

Ademas de la API REST, el proceso arranca un consumidor en background (`initGestionConsumer`, invocado desde `src/index.ts`) que escucha eventos publicados por otro microservicio cuando se publican notas de una evaluacion.

Payload esperado:

```json
{
  "evaluacionId": 123,
  "evaluacionNombre": "Prueba de Matematicas",
  "destinatarios": [
    { "email": "alumno@colegio.cl", "nombreCompleto": "Juan Perez" }
  ]
}
```

Por cada destinatario se envia un correo avisando que las notas estan disponibles.

El backend usado depende de `ENVIRONMENT`:

- `ENVIRONMENT=dev` (por defecto): se conecta a RabbitMQ usando `RABBITMQ_URL`, declara la cola `gestion.queue` (durable, `prefetch=1`) y reintenta la conexion hasta 5 veces con 5s de espera entre intentos. Si no logra conectar, la API sigue funcionando pero el consumidor no se inicia.
- `ENVIRONMENT=prod`: hace long polling contra AWS SQS (`SQS_QUEUE_URL`, region `AWS_REGION`) usando `@aws-sdk/client-sqs`, con `WaitTimeSeconds=20`. Este es el modo usado en el despliegue en ECS Fargate.

## Requisitos

Para desarrollo local:

- Node.js 18 o superior.
- pnpm (`corepack enable` habilita la version fijada en `package.json`).
- PostgreSQL accesible desde el servicio.
- Opcional para probar el consumidor en modo `dev`: una instancia de RabbitMQ accesible.

Para ejecucion con Docker:

- Docker Engine.
- Una base PostgreSQL accesible desde el contenedor, local o remota.

Para el entorno de produccion (ECS Fargate):

- Cola de AWS SQS creada (`SQS_QUEUE_URL`) y permisos IAM para consumirla.
- Credenciales de SMTP para el envio de correos.

## Variables de entorno

Crea un archivo `.env` a partir de `env.example` y completa las variables adicionales que use tu entorno (no todas estan listadas en la plantilla actual).

```env
PORT=3001
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=colegio
DB_SSL=false
UPLOAD_PATH=./uploads

# Autenticacion
JWT_SECRET=

# Email saliente (Nodemailer / SMTP)
MAIL_HOST=
MAIL_PORT=
MAIL_USER=
MAIL_PASS=

# Telegram (opcional)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# dev | prod — controla si el consumidor usa RabbitMQ (dev) o SQS (prod)
ENVIRONMENT=dev

# RabbitMQ (solo ENVIRONMENT=dev)
RABBITMQ_URL=

# AWS SQS (solo ENVIRONMENT=prod, es el modo usado en ECS Fargate)
SQS_QUEUE_URL=https://sqs.<region>.amazonaws.com/<account-id>/gestion-queue
AWS_REGION=us-east-1
```

Notas importantes:

- El envio de email usa SMTP a traves de Nodemailer (`MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`). Si falta alguna, el envio se omite y se loguea un error, sin interrumpir la respuesta HTTP.
- `JWT_SECRET` es obligatorio: sin el, cualquier llamada a `/api/mensajes/*` responde `500`.
- `DB_SSL=true` activa SSL con `rejectUnauthorized: false`, util para algunos proveedores administrados (por ejemplo RDS).
- `UPLOAD_PATH` debe existir o poder ser creado por el proceso. En Docker/ECS conviene tener presente que el almacenamiento del contenedor es efimero (ver [Consideraciones operativas](#consideraciones-operativas)).
- Las variables de Telegram son opcionales si no se enviaran copias externas.
- En ECS Fargate, inyecta estas variables desde la definicion de tarea (`environment` / `secrets` apuntando a Secrets Manager o SSM Parameter Store), nunca hardcodeadas en la imagen.

## Base de datos

El servicio espera una tabla `mensajeria` con, al menos, los siguientes campos:

- `id`
- `quien_envia`
- `quien_recibe`
- `fecha_hora`
- `asunto`
- `cuerpo_mensaje`
- `id_archivo_adjunto`
- `leido`

Para mensajes grupales, el controlador tambien consulta una tabla `usuarios` con al menos `email`, `rol_id` y `activo` (`rol_id = 2` profesores, `rol_id = 3` estudiantes).

El esquema es administrado fuera de este repositorio (se comparte con el resto del sistema Libro de Clases V3); aplica las migraciones correspondientes contra la base configurada en `DB_*` antes de levantar el servicio.

## Instalacion local

```bash
pnpm install
```

## Ejecucion local

Modo desarrollo con recarga:

```bash
pnpm run dev
```

Compilar y ejecutar como produccion:

```bash
pnpm run build
pnpm start
```

Ejecutar pruebas:

```bash
pnpm test
```

Ejecutar pruebas con reporte de cobertura:

```bash
pnpm run test:coverage
```

Health check:

```bash
curl http://localhost:3001/health
```

Respuesta esperada:

```json
{
  "status": "UP",
  "service": "MsMensajeria"
}
```

## Ejecucion con Docker

### 1. Construir la imagen

```bash
docker build -t ms-comunicaciones .
```

El `Dockerfile` es multi-stage: la etapa `builder` habilita `corepack`, instala dependencias con `pnpm install --frozen-lockfile` y compila con `pnpm run build`; la etapa final solo instala dependencias de produccion (`--prod`) y copia `dist/`.

### 2. Ejecutar contra una base PostgreSQL existente

Si la base esta fuera de Docker o en otro host accesible:

```bash
docker run --rm --name ms-comunicaciones --env-file .env -p 3001:3001 -v ms-comunicaciones-uploads:/app/uploads ms-comunicaciones
```

En este caso, define `UPLOAD_PATH=/app/uploads` en `.env`.

Si PostgreSQL corre en tu maquina host:

- En Windows/macOS puedes usar `DB_HOST=host.docker.internal`.
- En Linux puedes usar la IP del host o ejecutar API y DB en una misma red Docker.

### 3. Ejecutar API y PostgreSQL en la misma red Docker

Crear red:

```bash
docker network create comunicaciones-net
```

Levantar PostgreSQL:

```bash
docker run -d --name comunicaciones-db --network comunicaciones-net -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=colegio -p 5432:5432 postgres:16-alpine
```

Aplica el esquema de `mensajeria` y `usuarios` sobre esa base antes de continuar.

Configurar `.env` para Docker (ademas de `JWT_SECRET`, `MAIL_*`, etc. segun corresponda):

```env
PORT=3001
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=comunicaciones-db
DB_PORT=5432
DB_DATABASE=colegio
DB_SSL=false
UPLOAD_PATH=/app/uploads
ENVIRONMENT=dev
```

Levantar el microservicio:

```bash
docker run --rm --name ms-comunicaciones --network comunicaciones-net --env-file .env -p 3001:3001 -v ms-comunicaciones-uploads:/app/uploads ms-comunicaciones
```

Verificar:

```bash
curl http://localhost:3001/health
```

## API REST

Todos los endpoints bajo `/api/mensajes` requieren `Authorization: Bearer <token>` (ver [Autenticacion](#autenticacion)). `GET /health` es publico.

| Metodo | Endpoint | Auth | Descripcion |
| --- | --- | --- | --- |
| `POST` | `/api/mensajes` | JWT | Crea y envia un mensaje. Soporta `multipart/form-data` con archivo opcional. |
| `GET` | `/api/mensajes/recibidos/:email` | JWT | Lista mensajes recibidos por email. |
| `GET` | `/api/mensajes/enviados/:email` | JWT | Lista mensajes enviados por email. |
| `PATCH` | `/api/mensajes/leido/:id` | JWT | Marca un mensaje como leido. |
| `GET` | `/api/mensajes/descargar/:id` | JWT | Descarga el archivo adjunto de un mensaje. |
| `GET` | `/health` | Publico | Estado basico del servicio (usado por ECS/health checks). |

### Crear mensaje

Ejemplo con JSON:

```bash
curl -X POST http://localhost:3001/api/mensajes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quien_envia": "profesor@colegio.cl",
    "quien_recibe": "apoderado@colegio.cl",
    "asunto": "Reunion",
    "cuerpo_mensaje": "Estimado apoderado, favor confirmar asistencia.",
    "enviar_copia_telegram": false
  }'
```

Ejemplo con archivo adjunto:

```bash
curl -X POST http://localhost:3001/api/mensajes \
  -H "Authorization: Bearer $TOKEN" \
  -F "quien_envia=profesor@colegio.cl" \
  -F "quien_recibe=apoderado@colegio.cl" \
  -F "asunto=Material de apoyo" \
  -F "cuerpo_mensaje=Adjunto material de apoyo." \
  -F "enviar_copia_telegram=false" \
  -F "archivo=@./documento.pdf"
```

Destinatarios grupales soportados:

- `GROUP:PROFESORES`
- `GROUP:ESTUDIANTES`

## Scripts pnpm

| Script | Uso |
| --- | --- |
| `pnpm run dev` | Inicia el servidor con `ts-node-dev` (recarga automatica). |
| `pnpm run build` | Compila TypeScript en `dist/`. |
| `pnpm start` | Ejecuta `dist/index.js`. |
| `pnpm test` / `pnpm run test:run` | Corre pruebas con Vitest. |
| `pnpm run test:coverage` | Corre pruebas con reporte de cobertura (umbral: 70% lineas). |

## CI/CD y despliegue en AWS ECS (Fargate)

El workflow `.github/workflows/deploy.yaml` se dispara en cada push a `main` y tiene dos jobs:

1. **`test`**: instala dependencias con pnpm (`--frozen-lockfile`) y corre `vitest run --coverage`, publicando el reporte HTML como artifact de GitHub Actions.
2. **`build_and_push`**: construye la imagen con Docker Buildx y la publica en Docker Hub como `<usuario>/ms-comunicaciones:latest` y `<usuario>/ms-comunicaciones:<sha>`.

El resto del pipeline (actualizar el servicio de ECS, definicion de tarea, etc.) se administra fuera de este repositorio. Consideraciones al configurar el task de Fargate que ejecuta esta imagen:

- **Puerto del contenedor**: `3001` (o el valor de `PORT` inyectado por la definicion de tarea).
- **Health check**: apuntar a `GET /health` (endpoint publico, sin JWT), tanto para el health check de contenedor de ECS como para el target group del load balancer si se expone via ALB.
- **Proceso unico y siempre activo**: el mismo proceso Node sirve la API y corre el consumidor de eventos en background; el `desiredCount` del servicio ECS debe mantenerse en al menos 1 y no tratarse como un job programado.
- **Variables de entorno y secretos**: inyectar `DB_*`, `JWT_SECRET`, `MAIL_*`, `TELEGRAM_*`, `AWS_REGION` y `SQS_QUEUE_URL` desde la definicion de tarea, usando `secrets` (Secrets Manager / SSM Parameter Store) para credenciales sensibles en vez de variables planas.
- **`ENVIRONMENT=prod`**: en Fargate el consumidor debe usar SQS, no RabbitMQ. Asegurar que la task role tenga permisos `sqs:ReceiveMessage`, `sqs:DeleteMessage` y `sqs:GetQueueAttributes` sobre la cola indicada en `SQS_QUEUE_URL`.
- **Logs**: configurar el log driver `awslogs` para enviar la salida del contenedor a CloudWatch Logs.
- **Almacenamiento efimero**: el filesystem del contenedor Fargate no persiste entre despliegues/reinicios de la tarea. Los adjuntos guardados en `UPLOAD_PATH` se perderian en un redeploy salvo que se monte un volumen EFS en la definicion de tarea, o se migre el almacenamiento a S3.

## Consideraciones operativas

- Los adjuntos no se guardan como BLOB en PostgreSQL; se guarda la ruta del archivo en `id_archivo_adjunto`. En Fargate, ese storage es efimero (ver seccion anterior).
- El limite actual de subida es de 10 MB por archivo.
- Toda la API bajo `/api/mensajes` exige JWT valido; solo `/health` queda publico.
- Las notificaciones por email y Telegram al crear un mensaje se disparan de forma asincrona y no bloquean la respuesta principal.
- El consumidor de eventos "gestion de notas" corre en el mismo proceso que la API: si falla la conexion a RabbitMQ (modo dev), el servicio sigue respondiendo HTTP pero sin procesar esos eventos; en modo SQS (prod) el loop de long polling reintenta indefinidamente ante errores.
- CORS esta abierto a cualquier origen (`origin: "*"`) para facilitar integracion; ajustar antes de produccion si se requiere restringir clientes.
- No subas `.env` al repositorio. Mantener secretos en variables de entorno del entorno de despliegue (Secrets Manager / SSM en el caso de ECS).

---

Proyecto Libro de Clases V3.
