import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: sendMock,
    },
  })),
}));

describe('email.service - sendEmail', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  it('retorna false si falta RESEND_API_KEY', async () => {
    process.env.RESEND_FROM_EMAIL = 'Libro de Clases <test@example.com>';

    const { sendEmail } = await import('../services/email.service');
    const result = await sendEmail('dest@example.com', 'Asunto', 'Texto');

    expect(result).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('retorna false si falta RESEND_FROM_EMAIL', async () => {
    process.env.RESEND_API_KEY = 're_test_key';

    const { sendEmail } = await import('../services/email.service');
    const result = await sendEmail('dest@example.com', 'Asunto', 'Texto');

    expect(result).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('retorna true cuando Resend acepta el envio con html', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM_EMAIL = 'Libro de Clases <test@example.com>';
    sendMock.mockResolvedValueOnce({ error: null, data: { id: 'email_123' } });

    const { sendEmail } = await import('../services/email.service');
    const result = await sendEmail('dest@example.com', 'Asunto', 'Texto', '<b>Texto</b>');

    expect(result).toBe(true);
    expect(sendMock).toHaveBeenCalledWith({
      from: 'Libro de Clases <test@example.com>',
      to: 'dest@example.com',
      subject: 'Asunto',
      text: 'Texto',
      html: '<b>Texto</b>',
    });
  });

  it('envia sin html cuando no se proporciona', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM_EMAIL = 'Libro de Clases <test@example.com>';
    sendMock.mockResolvedValueOnce({ error: null, data: { id: 'email_456' } });

    const { sendEmail } = await import('../services/email.service');
    const result = await sendEmail('dest@example.com', 'Asunto', 'Texto');

    expect(result).toBe(true);
    expect(sendMock).toHaveBeenCalledWith({
      from: 'Libro de Clases <test@example.com>',
      to: 'dest@example.com',
      subject: 'Asunto',
      text: 'Texto',
    });
  });

  it('retorna false cuando Resend devuelve error', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM_EMAIL = 'Libro de Clases <test@example.com>';
    sendMock.mockResolvedValueOnce({ error: { message: 'bad request' }, data: null });

    const { sendEmail } = await import('../services/email.service');
    const result = await sendEmail('dest@example.com', 'Asunto', 'Texto');

    expect(result).toBe(false);
  });

  it('retorna false cuando Resend lanza excepcion', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM_EMAIL = 'Libro de Clases <test@example.com>';
    sendMock.mockRejectedValueOnce(new Error('network error'));

    const { sendEmail } = await import('../services/email.service');
    const result = await sendEmail('dest@example.com', 'Asunto', 'Texto');

    expect(result).toBe(false);
  });
});
