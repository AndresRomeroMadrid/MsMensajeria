import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { sendEmail } from '../services/email.service';

interface Destinatario {
  email: string;
  nombreCompleto: string;
}

interface GestionMessage {
  evaluacionId: number;
  evaluacionNombre: string;
  destinatarios: Destinatario[];
}

export const initGestionSqsConsumer = async (): Promise<void> => {
  const queueUrl = process.env.SQS_QUEUE_URL;

  console.log('[SQS] Iniciando consumidor...');

  if (!queueUrl) {
    console.error('[SQS] ❌ SQS_QUEUE_URL no definida. El consumidor no se iniciará.');
    return;
  }

  const client = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

  console.log('[SQS] ✅ Cliente creado. Entrando al loop de long polling...');

  while (true) {
    try {
      const result = await client.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20,
        }),
      );

      const messages = result.Messages ?? [];

      if (messages.length === 0) continue;

      const msg = messages[0];
      console.log('[SQS] 📨 Mensaje recibido. Procesando...');
      console.log('[SQS] Contenido raw:', msg.Body);

      let payload: GestionMessage;

      try {
        payload = JSON.parse(msg.Body ?? '') as GestionMessage;
        console.log(
          `[SQS] ✅ JSON parseado. evaluacionId=${payload.evaluacionId}, evaluacionNombre="${payload.evaluacionNombre}", destinatarios=${payload.destinatarios?.length ?? 0}`,
        );
      } catch {
        console.error('[SQS] ❌ JSON inválido. Descartando mensaje.');
        await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: msg.ReceiptHandle }));
        continue;
      }

      const { evaluacionId, evaluacionNombre, destinatarios } = payload;

      if (!destinatarios || destinatarios.length === 0) {
        console.warn(`[SQS] ⚠️  Sin destinatarios (evaluacionId: ${evaluacionId}). Descartando.`);
        await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: msg.ReceiptHandle }));
        continue;
      }

      for (const dest of destinatarios) {
        console.log(`[SQS] Enviando correo a: ${dest.email} (${dest.nombreCompleto})`);

        const subject = `Tus notas han sido publicadas — ${evaluacionNombre}`;
        const text = [
          `Hola ${dest.nombreCompleto},`,
          '',
          `Las notas de la evaluación "${evaluacionNombre}" ya están disponibles.`,
          'Ingresa al sistema para consultarlas.',
        ].join('\n');

        const sent = await sendEmail(dest.email, subject, text);

        if (sent) {
          console.log(`[SQS] ✅ Correo enviado a ${dest.email}`);
        } else {
          console.error(`[SQS] ❌ Fallo al enviar correo a ${dest.email}`);
        }
      }

      await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: msg.ReceiptHandle }));
      console.log(`[SQS] ✅ Mensaje eliminado de la cola (evaluacionId: ${evaluacionId})`);
    } catch (err: any) {
      console.error('[SQS] ❌ Error al recibir mensaje:', err.message);
    }
  }
};
