import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mensajeRoutes from './routes/mensaje.routes';

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas
app.use('/api/mensajes', mensajeRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'MsMensajeria' });
});

export default app;
