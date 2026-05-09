import { Request, Response } from 'express';
import pool from '../config/db';
import path from 'path';
import { sendEmail } from '../services/email.service';

export const createMensaje = async (req: Request, res: Response) => {
  try {
    const { quien_envia, quien_recibe, asunto, cuerpo_mensaje, enviar_copia_email } = req.body;
    let archivoPath = null;

    if (req.file) {
      archivoPath = path.join(req.file.destination, req.file.filename);
    }

    // Lógica para mensajes masivos (Grupos)
    let recipients: string[] = [];
    
    if (quien_recibe.startsWith('GROUP:')) {
      const groupType = quien_recibe.split(':')[1];
      let query = '';
      
      if (groupType === 'PROFESORES') {
        query = "SELECT email FROM usuarios WHERE rol_id = 2 AND activo = true";
      } else if (groupType === 'ESTUDIANTES') {
        query = "SELECT email FROM usuarios WHERE rol_id = 3 AND activo = true";
      }

      if (query) {
        const result = await pool.query(query);
        recipients = result.rows.map((r: any) => r.email);
      }
    } else {
      recipients = [quien_recibe];
    }

    if (recipients.length === 0) {
      return res.status(400).json({
        ok: false,
        mensaje: 'No se encontraron destinatarios para el grupo seleccionado'
      });
    }

    const query = `
      INSERT INTO mensajeria (quien_envia, quien_recibe, asunto, cuerpo_mensaje, id_archivo_adjunto, leido, fecha_hora)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `;

    const results = [];
    
    // Insertamos un registro para cada destinatario
    for (const recipient of recipients) {
      const values = [
        quien_envia,
        recipient,
        asunto,
        cuerpo_mensaje,
        archivoPath, 
        false
      ];

      const result = await pool.query(query, values);
      results.push(result.rows[0]);

      // Enviar correo si se solicitó
      if (enviar_copia_email === 'true' || enviar_copia_email === true) {
        // Lo enviamos de forma asíncrona para no retrasar la respuesta
        sendEmail(
          recipient, 
          `Nuevo Mensaje: ${asunto}`, 
          `Has recibido un nuevo mensaje de ${quien_envia}.\n\nAsunto: ${asunto}\n\nMensaje:\n${cuerpo_mensaje.replace(/<[^>]*>/g, '')}`
        ).catch(err => console.error(`Error enviando email a ${recipient}:`, err));
      }
    }

    return res.status(201).json({
      ok: true,
      mensaje: recipients.length > 1 
        ? `Mensaje enviado exitosamente a ${recipients.length} destinatarios` 
        : 'Mensaje enviado exitosamente',
      data: results[0]
    });

  } catch (error: any) {
    console.error('Error al crear mensaje:', error);
    return res.status(500).json({
      ok: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
};

export const getMensajesRecibidos = async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    const query = 'SELECT * FROM mensajeria WHERE quien_recibe = $1 ORDER BY fecha_hora DESC';
    const result = await pool.query(query, [email]);

    return res.json({
      ok: true,
      data: result.rows
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};

export const getMensajesEnviados = async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    const query = 'SELECT * FROM mensajeria WHERE quien_envia = $1 ORDER BY fecha_hora DESC';
    const result = await pool.query(query, [email]);

    return res.json({
      ok: true,
      data: result.rows
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};

export const markAsRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const query = 'UPDATE mensajeria SET leido = true WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);

    return res.json({
      ok: true,
      data: result.rows[0]
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};

export const downloadFile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const query = 'SELECT id_archivo_adjunto FROM mensajeria WHERE id = $1';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0 || !result.rows[0].id_archivo_adjunto) {
      return res.status(404).json({ ok: false, mensaje: 'Archivo no encontrado' });
    }

    const filePath = result.rows[0].id_archivo_adjunto;
    return res.download(filePath);
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};
