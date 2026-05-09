import { Router } from 'express';
import { 
  createMensaje, 
  getMensajesRecibidos, 
  getMensajesEnviados, 
  markAsRead,
  downloadFile
} from '../controllers/mensaje.controller';
import { upload } from '../config/multer';

const router = Router();

// Enviar un nuevo mensaje (con o sin archivo)
router.post('/', upload.single('archivo'), createMensaje);

// Obtener mensajes recibidos por un usuario
router.get('/recibidos/:email', getMensajesRecibidos);

// Obtener mensajes enviados por un usuario
router.get('/enviados/:email', getMensajesEnviados);

// Marcar como leído
router.patch('/leido/:id', markAsRead);

// Descargar archivo adjunto
router.get('/descargar/:id', downloadFile);

export default router;
