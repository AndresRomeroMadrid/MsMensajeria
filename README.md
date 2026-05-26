# Microservicio de Comunicaciones / Mensajeria

Microservicio Node.js + TypeScript para gestionar comunicaciones internas del sistema Libro de Clases V3. Expone una API REST para enviar mensajes, consultar bandejas de entrada/salida, marcar mensajes como leidos y descargar archivos adjuntos.

El servicio persiste los mensajes en PostgreSQL, almacena adjuntos en disco mediante Multer y puede enviar notificaciones externas por Resend y Telegram cuando el cliente lo solicita.

## Stack principal

- Runtime: Node.js 22 en Docker, compatible con Node.js 18+ en desarrollo local.
- Framework HTTP: Express 5.
- Lenguaje: TypeScript con `strict` habilitado.
- Base de datos: PostgreSQL mediante `pg`.
- Archivos adjuntos: Multer con almacenamiento local.
- Notificaciones: Resend para email y Telegram Bot API.
- Testing: Vitest.
- Contenedores: Docker multi-stage basado en `node:22-alpine3.20`.

## Estructura del proyecto

```text
ms_comunicaciones/
├── src/
│   ├── config/          # Configuracion transversal: PostgreSQL y Multer
│   ├── controllers/     # Casos HTTP: validan flujo, consultan DB y responden
│   ├── models/          # Interfaces de dominio
│   ├── routes/          # Definicion de endpoints Express
│   ├── services/        # Integraciones externas: email y Telegram
│   ├── tests/           # Pruebas unitarias con Vitest
│   ├── utils/           # Utilidades puras reutilizables
│   ├── app.ts           # App Express, middlewares, rutas y health check
│   └── index.ts         # Bootstrap del servidor HTTP
├── database.sql         # Script inicial de tabla `mensajeria`
├── Dockerfile           # Build multi-stage para produccion
├── env.example          # Plantilla de variables de entorno
├── package.json         # Scripts y dependencias npm
├── tsconfig.json        # Compilacion TypeScript a `dist/`
└── vitest.config.ts     # Configuracion de pruebas
```

## Arquetipo y patrones usados

El proyecto sigue un arquetipo simple de API REST por capas:

- `routes`: declara la superficie HTTP y compone middlewares, por ejemplo `upload.single('archivo')`.
- `controllers`: orquesta la peticion, ejecuta consultas SQL, invoca servicios externos y define la respuesta HTTP.
- `services`: encapsula integraciones con terceros, como Resend y Telegram.
- `config`: centraliza infraestructura local del proceso, como el pool de PostgreSQL y el storage de Multer.
- `utils`: contiene funciones puras sin dependencia de Express ni de infraestructura.

Los mensajes masivos se resuelven desde el controlador cuando `quien_recibe` usa el formato `GROUP:PROFESORES` o `GROUP:ESTUDIANTES`. En esos casos se consultan usuarios activos por `rol_id` y se inserta un mensaje por destinatario.

## Requisitos

Para desarrollo local:

- Node.js 18 o superior.
- npm.
- PostgreSQL accesible desde el servicio.

Para ejecucion con Docker:

- Docker Engine.
- Una base PostgreSQL accesible desde el contenedor, local o remota.

## Variables de entorno

Crea un archivo `.env` a partir de `env.example`.

```env
PORT=3001
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=colegio
DB_SSL=false
UPLOAD_PATH=./uploads
RESEND_API_KEY=
RESEND_FROM_EMAIL=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Notas importantes:

- El codigo usa `RESEND_API_KEY` y `RESEND_FROM_EMAIL` para email. Si tu `env.example` aun contiene `API_RESEND`, reemplazalo por `RESEND_API_KEY`.
- `DB_SSL=true` activa SSL con `rejectUnauthorized: false`, util para algunos proveedores administrados.
- `UPLOAD_PATH` debe existir o poder ser creado por el proceso. En Docker conviene montarlo como volumen.
- Las variables de Resend y Telegram son opcionales si no se enviaran copias externas.

## Base de datos

Ejecuta el script inicial sobre tu base PostgreSQL:

```bash
psql -h localhost -U postgres -d colegio -f database.sql
```

El script crea la tabla `mensajeria` con los campos usados por el servicio:

- `quien_envia`
- `quien_recibe`
- `fecha_hora`
- `asunto`
- `cuerpo_mensaje`
- `id_archivo_adjunto`
- `leido`

Para mensajes grupales, el controlador tambien consulta una tabla `usuarios` con al menos `email`, `rol_id` y `activo`.

## Instalacion local

```bash
npm install
```

## Ejecucion local

Modo desarrollo con recarga:

```bash
npm run dev
```

Compilar y ejecutar como produccion:

```bash
npm run build
npm start
```

Ejecutar pruebas:

```bash
npm test
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

Inicializar esquema:

```bash
docker cp database.sql comunicaciones-db:/database.sql
docker exec -it comunicaciones-db psql -U postgres -d colegio -f /database.sql
```

Configurar `.env` para Docker:

```env
PORT=3001
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=comunicaciones-db
DB_PORT=5432
DB_DATABASE=colegio
DB_SSL=false
UPLOAD_PATH=/app/uploads
RESEND_API_KEY=
RESEND_FROM_EMAIL=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
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

Todos los endpoints principales usan el prefijo `/api/mensajes`.

| Metodo | Endpoint | Descripcion |
| --- | --- | --- |
| `POST` | `/api/mensajes` | Crea y envia un mensaje. Soporta `multipart/form-data` con archivo opcional. |
| `GET` | `/api/mensajes/recibidos/:email` | Lista mensajes recibidos por email. |
| `GET` | `/api/mensajes/enviados/:email` | Lista mensajes enviados por email. |
| `PATCH` | `/api/mensajes/leido/:id` | Marca un mensaje como leido. |
| `GET` | `/api/mensajes/descargar/:id` | Descarga el archivo adjunto de un mensaje. |
| `GET` | `/health` | Estado basico del servicio. |

### Crear mensaje

Ejemplo con JSON:

```bash
curl -X POST http://localhost:3001/api/mensajes \
  -H "Content-Type: application/json" \
  -d '{
    "quien_envia": "profesor@colegio.cl",
    "quien_recibe": "apoderado@colegio.cl",
    "asunto": "Reunion",
    "cuerpo_mensaje": "Estimado apoderado, favor confirmar asistencia.",
    "enviar_copia_email": false,
    "enviar_copia_telegram": false
  }'
```

Ejemplo con archivo adjunto:

```bash
curl -X POST http://localhost:3001/api/mensajes \
  -F "quien_envia=profesor@colegio.cl" \
  -F "quien_recibe=apoderado@colegio.cl" \
  -F "asunto=Material de apoyo" \
  -F "cuerpo_mensaje=Adjunto material de apoyo." \
  -F "enviar_copia_email=false" \
  -F "enviar_copia_telegram=false" \
  -F "archivo=@./documento.pdf"
```

Destinatarios grupales soportados:

- `GROUP:PROFESORES`
- `GROUP:ESTUDIANTES`

## Scripts npm

| Script | Uso |
| --- | --- |
| `npm run dev` | Inicia el servidor con `ts-node-dev`. |
| `npm run build` | Compila TypeScript en `dist/`. |
| `npm start` | Ejecuta `dist/index.js`. |
| `npm test` | Corre pruebas con Vitest. |

## Consideraciones operativas

- Los adjuntos no se guardan como BLOB en PostgreSQL; se guarda la ruta del archivo en `id_archivo_adjunto`.
- El limite actual de subida es de 10 MB por archivo.
- Las notificaciones por email y Telegram se disparan de forma asincrona y no bloquean la respuesta principal.
- CORS esta abierto a cualquier origen (`origin: "*"`) para facilitar integracion; ajustar antes de produccion si se requiere restringir clientes.
- No subas `.env` al repositorio. Mantener secretos en variables de entorno del entorno de despliegue.

---

Proyecto Libro de Clases V3.
