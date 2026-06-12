import amqplib from 'amqplib';
import { sendEmail } from '../services/email.service';

const QUEUE_NAME = 'gestion.queue';

interface Destinatario {
  email: string;
  nombreCompleto: string;
}

interface GestionMessage {
  evaluacionId: number;
  evaluacionNombre: string;
  destinatarios: Destinatario[];
}

export const initGestionConsumer = async (): Promise<void> => {
  const rabbitmqUrl = process.env.RABBITMQ_URL;

  console.log('[RabbitMQ] Iniciando consumidor...');

  if (!rabbitmqUrl) {
    console.error('[RabbitMQ] ❌ RABBITMQ_URL no definida. El consumidor no se iniciará.');
    return;
  }

  console.log(`[RabbitMQ] Conectando a: ${rabbitmqUrl}`);

  try {
    const connection = await amqplib.connect(rabbitmqUrl);
    console.log('[RabbitMQ] ✅ Conexión establecida.');

    const channel = await connection.createChannel();
    console.log('[RabbitMQ] ✅ Canal creado.');

    await channel.assertQueue(QUEUE_NAME, { durable: true });
    console.log(`[RabbitMQ] ✅ Queue "${QUEUE_NAME}" declarada (durable).`);

    channel.prefetch(1);
    console.log('[RabbitMQ] prefetch=1 configurado. Esperando mensajes...');

    connection.on('error', (err: Error) => {
      console.error('[RabbitMQ] ❌ Error en conexión:', err.message);
    });

    connection.on('close', () => {
      console.warn('[RabbitMQ] ⚠️  Conexión cerrada.');
    });

    channel.consume(
      QUEUE_NAME,
      async (msg) => {
        if (!msg) {
          console.warn('[RabbitMQ] Mensaje nulo recibido (consumer cancelado por el broker).');
          return;
        }

        console.log('[RabbitMQ] 📨 Mensaje recibido. Procesando...');
        console.log('[RabbitMQ] Contenido raw:', msg.content.toString());

        let payload: GestionMessage;

        try {
          payload = JSON.parse(msg.content.toString()) as GestionMessage;
          console.log(`[RabbitMQ] ✅ JSON parseado. evaluacionId=${payload.evaluacionId}, evaluacionNombre="${payload.evaluacionNombre}", destinatarios=${payload.destinatarios?.length ?? 0}`);
        } catch {
          console.error('[RabbitMQ] ❌ JSON inválido. Descartando mensaje.');
          channel.ack(msg);
          return;
        }

        const { evaluacionId, evaluacionNombre, destinatarios } = payload;

        if (!destinatarios || destinatarios.length === 0) {
          console.warn(`[RabbitMQ] ⚠️  Sin destinatarios (evaluacionId: ${evaluacionId}). Descartando.`);
          channel.ack(msg);
          return;
        }

        for (const dest of destinatarios) {
          console.log(`[RabbitMQ] Enviando correo a: ${dest.email} (${dest.nombreCompleto})`);

          const subject = `Tus notas han sido publicadas — ${evaluacionNombre}`;
          const text = [
            `Hola ${dest.nombreCompleto},`,
            '',
            `Las notas de la evaluación "${evaluacionNombre}" ya están disponibles.`,
            'Ingresa al sistema para consultarlas.',
          ].join('\n');

          const sent = await sendEmail(dest.email, subject, text);

          if (sent) {
            console.log(`[RabbitMQ] ✅ Correo enviado a ${dest.email}`);
          } else {
            console.error(`[RabbitMQ] ❌ Fallo al enviar correo a ${dest.email}`);
          }
        }

        channel.ack(msg);
        console.log(`[RabbitMQ] ✅ Mensaje ack'd (evaluacionId: ${evaluacionId})`);
      },
      { noAck: false },
    );
  } catch (err: any) {
    console.error('[RabbitMQ] ❌ No se pudo conectar:', err.message);
    console.error('[RabbitMQ] Stack:', err.stack);
  }
};
