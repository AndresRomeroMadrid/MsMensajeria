# Spec: Integrar Resend como proveedor de correo

## Objetivo
Reemplazar completamente el envio de correos basado en Nodemailer/SMTP por Resend en el microservicio de mensajeria del Libro de Clases V3, manteniendo el comportamiento funcional actual de las copias por email y dejando el proyecto listo para desinstalar `nodemailer` y `@types/nodemailer`.

## Contexto
El microservicio de mensajeria permite enviar mensajes internos entre usuarios del colegio y, cuando `enviar_copia_email` viene habilitado, tambien envia una copia del mensaje al correo externo del destinatario.

Estado actual detectado:
- `resend` ya esta instalado en `package.json`.
- La API key de Resend ya esta configurada en `.env` segun la nota original del spec.
- `src/services/email.service.ts` usa `nodemailer.createTransport` con variables SMTP (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASS`).
- `src/controllers/mensaje.controller.ts` depende de `sendEmail(to, subject, text, html?)` y envia correos de forma asincrona para no retrasar la respuesta HTTP.
- `README.md` todavia documenta Nodemailer y variables SMTP.
- `package.json` y `package-lock.json` todavia incluyen `nodemailer` y `@types/nodemailer`.

## Alcance
- Reemplazar la implementacion interna de `src/services/email.service.ts` para usar el SDK de Resend.
- Mantener la firma publica actual de `sendEmail(to, subject, text, html?)` salvo que el `design.md` justifique un cambio compatible.
- Mantener el comportamiento actual del endpoint de creacion de mensajes: si `enviar_copia_email` es `true` o `'true'`, se intenta enviar la copia por correo sin bloquear la respuesta principal.
- Usar variables de entorno orientadas a Resend, como minimo `RESEND_API_KEY` y una direccion remitente verificable, por ejemplo `RESEND_FROM_EMAIL`.
- Eliminar toda dependencia de Nodemailer del codigo fuente.
- Actualizar `package.json` y `package-lock.json` para remover `nodemailer` y `@types/nodemailer`.
- Actualizar `README.md` para documentar Resend y retirar referencias a configuracion SMTP/Nodemailer.
- Agregar o ajustar tests relacionados al servicio de email y/o al flujo de mensajes si existen patrones de testing disponibles en el proyecto.
- Verificar que el build del proyecto pase.

## Fuera de alcance
- No cambiar la logica de persistencia de mensajes en PostgreSQL.
- No modificar la estructura de tablas ni crear migraciones de base de datos.
- No cambiar rutas, payloads o respuestas del API salvo errores estrictamente relacionados con configuracion de email.
- No implementar plantillas avanzadas de correo, React Email, colas, reintentos persistentes ni tracking de entregas.
- No integrar webhooks de Resend.
- No cambiar la integracion de Telegram.
- No instalar dependencias nuevas sin aprobacion explicita, acorde a `.agents/AGENTS.md`.

## Reglas de negocio
- El mensaje interno debe guardarse aunque falle el envio de la copia por email, conservando el comportamiento actual de no bloquear la creacion del mensaje por errores del proveedor de correo.
- El envio de email solo debe ejecutarse cuando `enviar_copia_email` sea `true` booleano o `'true'` string.
- El destinatario del correo debe seguir siendo el email resuelto para cada receptor, incluyendo envios masivos a grupos.
- El asunto debe mantener el formato funcional actual: `Nuevo Mensaje: {asunto}`.
- El cuerpo en texto plano debe seguir usando el contenido sanitizado con `cleanHtml(cuerpo_mensaje)` desde el controlador, o una sanitizacion equivalente si el diseño mueve esa responsabilidad.
- El remitente debe salir desde una variable de entorno compatible con dominios verificados de Resend; no debe quedar hardcodeado.
- No se deben registrar API keys, tokens ni secretos en logs.

## Requisitos tecnicos
- Instanciar Resend usando `RESEND_API_KEY` desde variables de entorno.
- Validar configuracion minima antes de enviar: API key y remitente configurados.
- Si falta configuracion de Resend, el servicio debe fallar de forma controlada, registrar un error claro sin secretos y devolver `false` para preservar la firma actual.
- Mapear la respuesta de Resend a un resultado booleano compatible con el uso actual de `sendEmail`.
- Manejar errores del SDK con `try/catch` y logs acotados.
- Evitar mantener variables SMTP obsoletas como requisito de ejecucion.
- Remover imports, tipos y referencias a `nodemailer` en todo el repositorio, excepto en notas historicas si fueran explicitamente necesarias.
- Mantener compatibilidad CommonJS/TypeScript del proyecto actual.

## Criterios de aceptacion
- Dado un mensaje con `enviar_copia_email: true`, cuando se crea el mensaje, entonces se invoca Resend para enviar la copia al destinatario correspondiente.
- Dado un mensaje con `enviar_copia_email: 'true'`, cuando se crea el mensaje, entonces se invoca Resend para enviar la copia al destinatario correspondiente.
- Dado un mensaje con `enviar_copia_email` ausente, `false` o distinto de `'true'`, cuando se crea el mensaje, entonces no se intenta enviar correo.
- Dado un fallo de Resend, cuando el mensaje interno ya fue persistido, entonces la respuesta HTTP de creacion de mensaje no debe fallar solo por el error del correo.
- Dado que `RESEND_API_KEY` o `RESEND_FROM_EMAIL` no estan configurados, cuando se intenta enviar correo, entonces el servicio registra un error claro sin exponer secretos y retorna `false`.
- No debe quedar ningun import o uso de `nodemailer` en `src/`.
- `package.json` no debe incluir `nodemailer` ni `@types/nodemailer`.
- `package-lock.json` debe quedar consistente con la remocion de Nodemailer.
- `README.md` debe documentar Resend y las variables de entorno vigentes.
- `npm run build` debe pasar.
- Los tests relacionados deben pasar si existen o se agregan.

## Casos borde
- Envio masivo a `GROUP:PROFESORES` o `GROUP:ESTUDIANTES`: cada destinatario debe recibir su intento de email individual cuando se solicita copia por email.
- `html` opcional: si se entrega contenido HTML a `sendEmail`, debe enviarse como HTML; si no se entrega, debe bastar con texto plano.
- Direccion remitente invalida o dominio no verificado en Resend: debe tratarse como error controlado del proveedor.
- Error parcial en envio masivo: un fallo para un destinatario no debe impedir procesar los demas destinatarios.

## Riesgos tecnicos
- Resend requiere que el dominio o remitente este verificado; una API key valida no garantiza entregabilidad.
- El cambio de SMTP a API externa puede cambiar mensajes de error y formato de respuesta, por lo que los logs deben ser utiles sin acoplarse a detalles inestables del SDK.
- Si el proyecto no tiene tests para `sendEmail`, sera facil romper el flujo asincrono sin detectarlo; conviene cubrir el servicio con mocks del SDK.
- Remover dependencias debe hacerse con el gestor del proyecto para mantener `package-lock.json` consistente; si se requiere ejecutar comandos que modifiquen dependencias, debe respetarse la regla de pedir aprobacion antes de instalar dependencias nuevas.

## Supuestos
- La variable `RESEND_API_KEY` ya existe en `.env` como indica el spec original.
- El remitente verificado de Resend puede agregarse como `RESEND_FROM_EMAIL` si aun no existe.
- No se requiere almacenar el ID de envio devuelto por Resend en base de datos.
- La prioridad es mantener paridad funcional con Nodemailer, no introducir nuevas capacidades de email.

## Entregables esperados posteriores
Acorde a `.agents/AGENTS.md`, antes de implementar deben existir tambien:
- `.agents/specs/integrar-resend/design.md`
- `.agents/specs/integrar-resend/tasks.md`

Este spec no autoriza implementacion por si solo; la implementacion debe esperar aprobacion del spec y la creacion del diseño y tareas correspondientes.
