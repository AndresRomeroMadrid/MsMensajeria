import app from './app';
import dotenv from 'dotenv';
import { initGestionConsumer } from './consumers/gestion.consumer';

dotenv.config();

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`
  🚀 Microservicio de Mensajería corriendo en: http://localhost:${PORT}
  📁 Ruta de archivos: ${process.env.UPLOAD_PATH}
  ✨ ¡Listo para recibir mensajes!
  `);

  initGestionConsumer().catch((err) => {
    console.error('❌ Error inesperado al iniciar consumidor RabbitMQ:', err);
  });
});
