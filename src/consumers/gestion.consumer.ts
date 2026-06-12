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

  if (!rabbitmqUrl) {
    console.error('❌ RABBITMQ_URL no definida. El consumidor de gestion.queue no se iniciará.');
    return;
  }

  try {
    const connection = await amqplib.connect(rabbitmqUrl);
    const channel = await connection.createChannel();

    await channel.assertQueue(QUEUE_NAME, { durable: true });
    channel.prefetch(1);

    console.log(`✅ RabbitMQ conectado. Escuchando: ${QUEUE_NAME}`);

    connection.on('error', (err: Error) => {
      console.error('❌ Error en conexión RabbitMQ:', err.message);
    });

    connection.on('close', () => {
      console.warn('⚠️  Conexión a RabbitMQ cerrada.');
    });

    channel.consume(
      QUEUE_NAME,
      async (msg) => {
        if (!msg) return;

        let payload: GestionMessage;

        try {
          payload = JSON.parse(msg.content.toString()) as GestionMessage;
        } catch {
          console.error('❌ JSON inválido en mensaje de gestion.queue:', msg.content.toString());
          channel.ack(msg);
          return;
        }

        const { evaluacionId, evaluacionNombre, destinatarios } = payload;

        if (!destinatarios || destinatarios.length === 0) {
          console.warn(`⚠️  Mensaje sin destinatarios (evaluacionId: ${evaluacionId})`);
          channel.ack(msg);
          return;
        }

        for (const dest of destinatarios) {
          const subject = `Tus notas han sido publicadas — ${evaluacionNombre}`;
          const text = [
            `Hola ${dest.nombreCompleto},`,
            '',
            `Las notas de la evaluación "${evaluacionNombre}" ya están disponibles.`,
            'Ingresa al sistema para consultarlas.',
          ].join('\n');

          const sent = await sendEmail(dest.email, subject, text);
          if (!sent) {
            console.error(`❌ Error al enviar correo a ${dest.email} (evaluacion: ${evaluacionNombre})`);
          }
        }

        channel.ack(msg);
      },
      { noAck: false },
    );
  } catch (err: any) {
    console.error('❌ No se pudo conectar a RabbitMQ:', err.message);
  }
};
