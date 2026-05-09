# ✉️ Microservicio de Mensajería (MsMensajeria)

Este microservicio es el encargado de gestionar toda la comunicación interna del sistema **Libro de Clases V3**. Permite el envío de mensajes entre usuarios, soporte para archivos adjuntos, notificaciones por correo electrónico y seguimiento del estado de lectura.

## 🛠️ Tecnologías Utilizadas

- **Runtime:** Node.js v18+
- **Framework:** Express.js
- **Lenguaje:** TypeScript
- **Base de Datos:** PostgreSQL
- **Gestión de Archivos:** Multer (Almacenamiento local)
- **Email:** Nodemailer (SMTP)

## 📁 Estructura del Proyecto

```text
MsMensajeria/
├── src/
│   ├── config/       # Configuración de DB, Multer, etc.
│   ├── controllers/  # Lógica de negocio de los endpoints
│   ├── models/       # Interfaces y definiciones de datos
│   ├── routes/       # Definición de rutas API
│   ├── app.ts        # Configuración de Express
│   └── index.ts      # Punto de entrada del servidor
├── database.sql      # Script de creación de tablas
├── .env              # Variables de entorno (no incluido en git)
└── package.json      # Dependencias y scripts
```

## 🚀 Instalación y Uso

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar variables de entorno:**
   Crea un archivo `.env` basado en el siguiente ejemplo:
   ```env
   PORT=3001
   DB_USER=tu_usuario
   DB_PASSWORD=tu_password
   DB_HOST=localhost
   DB_PORT=5432
   DB_DATABASE=colegio
   UPLOAD_PATH=C:\ruta\al\directorio\FTP
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_SECURE=false
   EMAIL_USER=tu-correo@gmail.com
   EMAIL_PASS=tu-clave-de-aplicacion
   ```

3. **Iniciar en modo desarrollo:**
   ```bash
   npm run dev
   ```

4. **Compilar para producción:**
   ```bash
   npm run build
   npm start
   ```

## 📡 API Endpoints

Todos los endpoints tienen el prefijo `/api/mensajes`.

| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `POST` | `/` | Envía un mensaje (soporta `multipart/form-data` para archivos). |
| `GET` | `/recibidos/:email` | Lista los mensajes recibidos por el email proporcionado. |
| `GET` | `/enviados/:email` | Lista los mensajes enviados por el email proporcionado. |
| `PATCH` | `/leido/:id` | Marca un mensaje específico como leído. |
| `GET` | `/descargar/:id` | Descarga el archivo adjunto asociado a un mensaje. |

## 📧 Integración de Correo Electrónico

El microservicio utiliza **Nodemailer** para enviar una copia del mensaje al correo electrónico externo del destinatario si así se solicita en la petición (`enviar_copia_email: true`).

## 💾 Persistencia de Archivos

Los archivos adjuntos no se guardan en la base de datos como BLOBs; en su lugar, se almacenan en el sistema de archivos local (`UPLOAD_PATH`) y se guarda la ruta absoluta en la columna `id_archivo_adjunto` de la tabla `mensajes`.

---
**Andres Romero** - Proyecto Libro de Clases V3
