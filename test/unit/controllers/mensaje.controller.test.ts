import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import path from 'path';

const { poolQueryMock, sendEmailMock, sendTelegramMock } = vi.hoisted(() => ({
  poolQueryMock: vi.fn(),
  sendEmailMock: vi.fn(),
  sendTelegramMock: vi.fn(),
}));

vi.mock('../../../src/config/db', () => ({
  default: { query: poolQueryMock },
}));

vi.mock('../../../src/services/email.service', () => ({
  sendEmail: sendEmailMock,
}));

vi.mock('../../../src/services/telegram.service', () => ({
  sendTelegramNotification: sendTelegramMock,
}));

import {
  createMensaje,
  getMensajesRecibidos,
  getMensajesEnviados,
  markAsRead,
  downloadFile,
} from '../../../src/controllers/mensaje.controller';

const makeMockRes = () => {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
    download: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as Response;
};

describe('mensaje.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolQueryMock.mockResolvedValue({ rows: [] });
    sendEmailMock.mockResolvedValue(true);
    sendTelegramMock.mockResolvedValue(true);
  });

  describe('createMensaje', () => {
    it('inserta un mensaje para destinatario individual y retorna 201', async () => {
      const req = {
        body: {
          quien_envia: 'sender@test.com',
          quien_recibe: 'recipient@test.com',
          asunto: 'Test',
          cuerpo_mensaje: 'Hola',
          enviar_copia_telegram: false,
        },
        file: undefined,
      } as unknown as Request;
      const res = makeMockRes();

      poolQueryMock.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await createMensaje(req, res);

      expect(poolQueryMock).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    });

    it('expande GROUP:PROFESORES y hace un INSERT por cada destinatario', async () => {
      const req = {
        body: {
          quien_envia: 'sender@test.com',
          quien_recibe: 'GROUP:PROFESORES',
          asunto: 'Circular',
          cuerpo_mensaje: 'Mensaje',
          enviar_copia_telegram: false,
        },
        file: undefined,
      } as unknown as Request;
      const res = makeMockRes();

      poolQueryMock
        .mockResolvedValueOnce({ rows: [{ email: 'prof1@test.com' }, { email: 'prof2@test.com' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 2 }] });

      await createMensaje(req, res);

      expect(poolQueryMock).toHaveBeenCalledTimes(3);
      expect(res.status).toHaveBeenCalledWith(201);
      const jsonArg = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(jsonArg.mensaje).toContain('2 destinatarios');
    });

    it('usa rol_id = 3 para GROUP:ESTUDIANTES', async () => {
      const req = {
        body: {
          quien_envia: 'sender@test.com',
          quien_recibe: 'GROUP:ESTUDIANTES',
          asunto: 'Aviso',
          cuerpo_mensaje: 'Mensaje',
          enviar_copia_telegram: false,
        },
        file: undefined,
      } as unknown as Request;
      const res = makeMockRes();

      poolQueryMock
        .mockResolvedValueOnce({ rows: [{ email: 'est1@test.com' }] })
        .mockResolvedValueOnce({ rows: [{ id: 3 }] });

      await createMensaje(req, res);

      expect(poolQueryMock.mock.calls[0][0]).toContain('rol_id = 3');
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('retorna 400 si el grupo no tiene destinatarios', async () => {
      const req = {
        body: {
          quien_envia: 'sender@test.com',
          quien_recibe: 'GROUP:PROFESORES',
          asunto: 'Test',
          cuerpo_mensaje: 'Mensaje',
          enviar_copia_telegram: false,
        },
        file: undefined,
      } as unknown as Request;
      const res = makeMockRes();

      poolQueryMock.mockResolvedValueOnce({ rows: [] });

      await createMensaje(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    });

    it('incluye la ruta del archivo adjunto en el INSERT', async () => {
      const req = {
        body: {
          quien_envia: 'sender@test.com',
          quien_recibe: 'recipient@test.com',
          asunto: 'Con adjunto',
          cuerpo_mensaje: 'Mensaje',
          enviar_copia_telegram: false,
        },
        file: { destination: '/tmp/uploads', filename: 'doc.pdf' },
      } as unknown as Request;
      const res = makeMockRes();

      poolQueryMock.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await createMensaje(req, res);

      const insertValues = poolQueryMock.mock.calls[0][1];
      expect(insertValues[4]).toBe(path.join('/tmp/uploads', 'doc.pdf'));
    });

    it('usa archivoPath null cuando no hay archivo adjunto', async () => {
      const req = {
        body: {
          quien_envia: 'sender@test.com',
          quien_recibe: 'recipient@test.com',
          asunto: 'Sin adjunto',
          cuerpo_mensaje: 'Mensaje',
          enviar_copia_telegram: false,
        },
        file: undefined,
      } as unknown as Request;
      const res = makeMockRes();

      poolQueryMock.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await createMensaje(req, res);

      const insertValues = poolQueryMock.mock.calls[0][1];
      expect(insertValues[4]).toBeNull();
    });

    it('llama a sendTelegramNotification cuando enviar_copia_telegram es "true" (string)', async () => {
      const req = {
        body: {
          quien_envia: 'sender@test.com',
          quien_recibe: 'recipient@test.com',
          asunto: 'Con Telegram',
          cuerpo_mensaje: 'Mensaje',
          enviar_copia_telegram: 'true',
        },
        file: undefined,
      } as unknown as Request;
      const res = makeMockRes();

      poolQueryMock.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await createMensaje(req, res);

      expect(sendTelegramMock).toHaveBeenCalledTimes(1);
    });

    it('llama a sendTelegramNotification cuando enviar_copia_telegram es booleano true', async () => {
      const req = {
        body: {
          quien_envia: 'sender@test.com',
          quien_recibe: 'recipient@test.com',
          asunto: 'Con Telegram',
          cuerpo_mensaje: 'Mensaje',
          enviar_copia_telegram: true,
        },
        file: undefined,
      } as unknown as Request;
      const res = makeMockRes();

      poolQueryMock.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await createMensaje(req, res);

      expect(sendTelegramMock).toHaveBeenCalledTimes(1);
    });

    it('NO llama a sendTelegramNotification cuando no se solicita', async () => {
      const req = {
        body: {
          quien_envia: 'sender@test.com',
          quien_recibe: 'recipient@test.com',
          asunto: 'Sin Telegram',
          cuerpo_mensaje: 'Mensaje',
        },
        file: undefined,
      } as unknown as Request;
      const res = makeMockRes();

      poolQueryMock.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await createMensaje(req, res);

      expect(sendTelegramMock).not.toHaveBeenCalled();
    });

    it('llama a sendEmail por cada destinatario del grupo', async () => {
      const req = {
        body: {
          quien_envia: 'sender@test.com',
          quien_recibe: 'GROUP:PROFESORES',
          asunto: 'Circular',
          cuerpo_mensaje: 'Mensaje',
          enviar_copia_telegram: false,
        },
        file: undefined,
      } as unknown as Request;
      const res = makeMockRes();

      poolQueryMock
        .mockResolvedValueOnce({ rows: [{ email: 'a@test.com' }, { email: 'b@test.com' }] })
        .mockResolvedValue({ rows: [{ id: 1 }] });

      await createMensaje(req, res);

      expect(sendEmailMock).toHaveBeenCalledTimes(2);
    });

    it('retorna 400 cuando el tipo de grupo es desconocido (GROUP:OTRO)', async () => {
      const req = {
        body: {
          quien_envia: 'sender@test.com',
          quien_recibe: 'GROUP:OTRO',
          asunto: 'Test',
          cuerpo_mensaje: 'Mensaje',
          enviar_copia_telegram: false,
        },
        file: undefined,
      } as unknown as Request;
      const res = makeMockRes();

      await createMensaje(req, res);

      // query queda vacío → pool.query no se llama para el grupo
      expect(poolQueryMock).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    });

    it('retorna 500 cuando pool.query lanza error', async () => {
      const req = {
        body: {
          quien_envia: 'sender@test.com',
          quien_recibe: 'recipient@test.com',
          asunto: 'Test',
          cuerpo_mensaje: 'Mensaje',
        },
        file: undefined,
      } as unknown as Request;
      const res = makeMockRes();

      poolQueryMock.mockRejectedValueOnce(new Error('DB error'));

      await createMensaje(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    });
  });

  describe('getMensajesRecibidos', () => {
    it('retorna los mensajes recibidos por el usuario', async () => {
      const req = { params: { email: 'user@test.com' } } as unknown as Request;
      const res = makeMockRes();
      const fakeRows = [{ id: 1, asunto: 'Test' }];

      poolQueryMock.mockResolvedValueOnce({ rows: fakeRows });

      await getMensajesRecibidos(req, res);

      expect(res.json).toHaveBeenCalledWith({ ok: true, data: fakeRows });
    });

    it('retorna 500 cuando pool.query lanza error', async () => {
      const req = { params: { email: 'user@test.com' } } as unknown as Request;
      const res = makeMockRes();

      poolQueryMock.mockRejectedValueOnce(new Error('DB error'));

      await getMensajesRecibidos(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getMensajesEnviados', () => {
    it('retorna los mensajes enviados por el usuario', async () => {
      const req = { params: { email: 'user@test.com' } } as unknown as Request;
      const res = makeMockRes();
      const fakeRows = [{ id: 2, asunto: 'Enviado' }];

      poolQueryMock.mockResolvedValueOnce({ rows: fakeRows });

      await getMensajesEnviados(req, res);

      expect(res.json).toHaveBeenCalledWith({ ok: true, data: fakeRows });
    });

    it('retorna 500 cuando pool.query lanza error', async () => {
      const req = { params: { email: 'user@test.com' } } as unknown as Request;
      const res = makeMockRes();

      poolQueryMock.mockRejectedValueOnce(new Error('DB error'));

      await getMensajesEnviados(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('markAsRead', () => {
    it('marca el mensaje como leído y retorna el registro actualizado', async () => {
      const req = { params: { id: '42' } } as unknown as Request;
      const res = makeMockRes();
      const updatedRow = { id: 42, leido: true };

      poolQueryMock.mockResolvedValueOnce({ rows: [updatedRow] });

      await markAsRead(req, res);

      expect(res.json).toHaveBeenCalledWith({ ok: true, data: updatedRow });
    });

    it('retorna 500 cuando pool.query lanza error', async () => {
      const req = { params: { id: '42' } } as unknown as Request;
      const res = makeMockRes();

      poolQueryMock.mockRejectedValueOnce(new Error('DB error'));

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('downloadFile', () => {
    it('llama a res.download con la ruta del archivo adjunto', async () => {
      const req = { params: { id: '1' } } as unknown as Request;
      const res = makeMockRes();

      poolQueryMock.mockResolvedValueOnce({ rows: [{ id_archivo_adjunto: '/tmp/doc.pdf' }] });

      await downloadFile(req, res);

      expect(res.download).toHaveBeenCalledWith('/tmp/doc.pdf');
    });

    it('retorna 404 si no se encuentra el mensaje', async () => {
      const req = { params: { id: '999' } } as unknown as Request;
      const res = makeMockRes();

      poolQueryMock.mockResolvedValueOnce({ rows: [] });

      await downloadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    });

    it('retorna 404 si el mensaje no tiene archivo adjunto', async () => {
      const req = { params: { id: '2' } } as unknown as Request;
      const res = makeMockRes();

      poolQueryMock.mockResolvedValueOnce({ rows: [{ id_archivo_adjunto: null }] });

      await downloadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('retorna 500 cuando pool.query lanza error', async () => {
      const req = { params: { id: '1' } } as unknown as Request;
      const res = makeMockRes();

      poolQueryMock.mockRejectedValueOnce(new Error('DB error'));

      await downloadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
