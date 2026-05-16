# Tasks: Integrar Resend como proveedor de correo

## Task 1: Preparar configuracion de Resend
- Objetivo: Definir las variables de entorno que usara el servicio de email con Resend y retirar la dependencia conceptual de SMTP.
- Archivos esperados:
  - `README.md`
  - `.env.example` si existe o si se decide crearlo como parte de la documentacion del proyecto
- Tests requeridos:
  - No aplica test automatizado para documentacion.
- Criterio de finalizacion:
  - `README.md` documenta `RESEND_API_KEY` y `RESEND_FROM_EMAIL`.
  - `README.md` deja de presentar `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER` y `EMAIL_PASS` como variables requeridas.
  - No se exponen valores reales de `.env` ni secretos.

## Task 2: Migrar `email.service.ts` de Nodemailer a Resend
- Objetivo: Reemplazar la implementacion interna de envio de correo usando el SDK de Resend sin cambiar el contrato publico `sendEmail(to, subject, text, html?)`.
- Archivos esperados:
  - `src/services/email.service.ts`
- Tests requeridos:
  - Cubrir en tests unitarios o verificar manualmente por build que la firma exportada sigue siendo compatible.
- Criterio de finalizacion:
  - No existe import de `nodemailer` en `src/services/email.service.ts`.
  - `sendEmail` instancia o usa Resend con `RESEND_API_KEY`.
  - `sendEmail` usa `RESEND_FROM_EMAIL` como remitente.
  - Si falta `RESEND_API_KEY` o `RESEND_FROM_EMAIL`, retorna `false` y registra un error sin secretos.
  - Si Resend acepta el envio, retorna `true`.
  - Si Resend falla o lanza excepcion, retorna `false` sin propagar el error al controlador.

## Task 3: Preservar el flujo del controlador de mensajes
- Objetivo: Confirmar que `mensaje.controller.ts` sigue invocando `sendEmail` solo cuando corresponde, sin acoplarse a Resend.
- Archivos esperados:
  - `src/controllers/mensaje.controller.ts` solo si es estrictamente necesario
- Tests requeridos:
  - Si se toca el controlador, agregar o ajustar tests que verifiquen los casos del flag `enviar_copia_email`.
- Criterio de finalizacion:
  - El controlador no importa `resend` ni conoce detalles del proveedor.
  - El envio de email se mantiene asincrono y no bloquea la respuesta HTTP.
  - `enviar_copia_email: true` y `enviar_copia_email: 'true'` disparan el envio.
  - `enviar_copia_email` ausente, `false` o distinto de `'true'` no dispara el envio.
  - Un error de email no impide responder `201` cuando el mensaje interno ya fue persistido.

## Task 4: Agregar tests unitarios del servicio de email
- Objetivo: Cubrir la logica critica de configuracion, payload y errores del proveedor Resend.
- Archivos esperados:
  - `src/tests/email.service.test.ts`
- Tests requeridos:
  - Mock de `resend` con Vitest.
  - Caso sin `RESEND_API_KEY`: retorna `false` y no llama al SDK.
  - Caso sin `RESEND_FROM_EMAIL`: retorna `false` y no llama al SDK.
  - Caso exitoso: llama `resend.emails.send` con `from`, `to`, `subject`, `text` y `html` cuando corresponde.
  - Caso exitoso sin `html`: envia solo texto plano o no incluye `html` vacio.
  - Caso de excepcion/error de Resend: retorna `false`.
- Criterio de finalizacion:
  - `npm test` ejecuta los tests nuevos junto con los existentes.
  - Los tests no realizan llamadas reales a Resend.
  - Los tests no dependen de valores reales de `.env`.

## Task 5: Remover dependencias de Nodemailer
- Objetivo: Dejar el proyecto listo para instalar y compilar sin Nodemailer.
- Archivos esperados:
  - `package.json`
  - `package-lock.json`
- Tests requeridos:
  - `npm run build`
  - `npm test`
- Criterio de finalizacion:
  - `package.json` no contiene `nodemailer` en `dependencies`.
  - `package.json` no contiene `@types/nodemailer` en `devDependencies`.
  - `package-lock.json` queda consistente con la remocion.
  - `resend` permanece instalado como dependencia runtime.
  - No se instalan dependencias nuevas sin aprobacion explicita.

## Task 6: Limpiar referencias obsoletas a SMTP/Nodemailer
- Objetivo: Verificar que no quedan referencias runtime ni documentacion activa que contradigan la migracion.
- Archivos esperados:
  - `README.md`
  - `src/services/email.service.ts`
  - `package.json`
  - `package-lock.json`
- Tests requeridos:
  - Ejecutar busqueda de referencias obsoletas.
- Criterio de finalizacion:
  - `rg -n "nodemailer|createTransport|sendMail" src package.json package-lock.json README.md` no encuentra usos activos de Nodemailer.
  - `rg -n "EMAIL_HOST|EMAIL_PORT|EMAIL_SECURE|EMAIL_USER|EMAIL_PASS" README.md src` no encuentra variables SMTP como configuracion requerida.
  - Cualquier referencia historica, si se conserva, debe estar claramente marcada como obsoleta y no requerida.

## Task 7: Validacion final
- Objetivo: Confirmar que la migracion cumple el spec aprobado y no introduce cambios fuera de alcance.
- Archivos esperados:
  - No deberia requerir archivos nuevos salvo resultados de ajustes menores detectados durante validacion.
- Tests requeridos:
  - `npm run build`
  - `npm test`
  - Busqueda final de referencias obsoletas con `rg`.
- Criterio de finalizacion:
  - El build TypeScript pasa.
  - La suite de tests pasa.
  - No quedan imports o usos de Nodemailer en `src/`.
  - El flujo de mensajes sigue persistiendo mensajes aunque falle el email.
  - No se modifico base de datos, rutas HTTP ni integracion Telegram.
  - El diff final esta limitado al alcance del spec: servicio de email, tests, documentacion y dependencias.
