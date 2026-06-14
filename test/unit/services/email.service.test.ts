import { describe, it, expect, vi, beforeEach } from 'vitest';

const { sendMailMock, createTransportMock } = vi.hoisted(() => ({
  sendMailMock: vi.fn(),
  createTransportMock: vi.fn(),
}));

// Impide que dotenv.config() lea el .env real durante los tests
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
  config: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: { createTransport: createTransportMock },
}));

describe('email.service - sendEmail', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.MAIL_HOST;
    delete process.env.MAIL_PORT;
    delete process.env.MAIL_USER;
    delete process.env.MAIL_PASS;
    createTransportMock.mockReturnValue({ sendMail: sendMailMock });
    sendMailMock.mockResolvedValue({ messageId: 'test-id' });
  });

  it('retorna false si falta alguna variable de configuración', async () => {
    process.env.MAIL_HOST = 'smtp.test.com';
    // MAIL_PORT, MAIL_USER, MAIL_PASS ausentes
    const { sendEmail } = await import('../../../src/services/email.service');
    const result = await sendEmail('dest@test.com', 'Asunto', 'Texto');
    expect(result).toBe(false);
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('retorna false si todas las variables de configuración faltan', async () => {
    const { sendEmail } = await import('../../../src/services/email.service');
    const result = await sendEmail('dest@test.com', 'Asunto', 'Texto');
    expect(result).toBe(false);
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('retorna true cuando el envío es exitoso sin html', async () => {
    process.env.MAIL_HOST = 'smtp.test.com';
    process.env.MAIL_PORT = '587';
    process.env.MAIL_USER = 'user@test.com';
    process.env.MAIL_PASS = 'secret';

    const { sendEmail } = await import('../../../src/services/email.service');
    const result = await sendEmail('dest@test.com', 'Asunto', 'Texto');

    expect(result).toBe(true);
    expect(sendMailMock).toHaveBeenCalledWith({
      from: 'user@test.com',
      to: 'dest@test.com',
      subject: 'Asunto',
      text: 'Texto',
    });
  });

  it('retorna true cuando el envío es exitoso con html', async () => {
    process.env.MAIL_HOST = 'smtp.test.com';
    process.env.MAIL_PORT = '587';
    process.env.MAIL_USER = 'user@test.com';
    process.env.MAIL_PASS = 'secret';

    const { sendEmail } = await import('../../../src/services/email.service');
    const result = await sendEmail('dest@test.com', 'Asunto', 'Texto', '<b>Texto</b>');

    expect(result).toBe(true);
    expect(sendMailMock).toHaveBeenCalledWith({
      from: 'user@test.com',
      to: 'dest@test.com',
      subject: 'Asunto',
      text: 'Texto',
      html: '<b>Texto</b>',
    });
  });

  it('retorna false cuando sendMail lanza un error', async () => {
    process.env.MAIL_HOST = 'smtp.test.com';
    process.env.MAIL_PORT = '587';
    process.env.MAIL_USER = 'user@test.com';
    process.env.MAIL_PASS = 'secret';
    sendMailMock.mockRejectedValueOnce(new Error('SMTP error'));

    const { sendEmail } = await import('../../../src/services/email.service');
    const result = await sendEmail('dest@test.com', 'Asunto', 'Texto');
    expect(result).toBe(false);
  });

  it('configura secure: true cuando el puerto es 465', async () => {
    process.env.MAIL_HOST = 'smtp.test.com';
    process.env.MAIL_PORT = '465';
    process.env.MAIL_USER = 'user@test.com';
    process.env.MAIL_PASS = 'secret';

    const { sendEmail } = await import('../../../src/services/email.service');
    await sendEmail('dest@test.com', 'Asunto', 'Texto');

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true })
    );
  });

  it('configura secure: false cuando el puerto no es 465', async () => {
    process.env.MAIL_HOST = 'smtp.test.com';
    process.env.MAIL_PORT = '587';
    process.env.MAIL_USER = 'user@test.com';
    process.env.MAIL_PASS = 'secret';

    const { sendEmail } = await import('../../../src/services/email.service');
    await sendEmail('dest@test.com', 'Asunto', 'Texto');

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ secure: false })
    );
  });
});
