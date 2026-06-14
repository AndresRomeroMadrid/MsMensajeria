import { describe, it, expect, vi, beforeEach } from 'vitest';

const { requestMock, mockReqObj } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  mockReqObj: { write: vi.fn(), end: vi.fn(), on: vi.fn() },
}));

vi.mock('https', () => ({
  default: { request: requestMock },
}));

const makeSuccessRes = (statusCode: number) => ({
  statusCode,
  on: vi.fn().mockImplementation((event: string, handler: () => void) => {
    if (event === 'end') setImmediate(handler);
  }),
});

describe('telegram.service - sendTelegramNotification', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  it('retorna false si falta TELEGRAM_BOT_TOKEN', async () => {
    process.env.TELEGRAM_CHAT_ID = '12345';
    const { sendTelegramNotification } = await import('../../../src/services/telegram.service');
    const result = await sendTelegramNotification('test message');
    expect(result).toBe(false);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('retorna false si falta TELEGRAM_CHAT_ID', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'valid-token';
    const { sendTelegramNotification } = await import('../../../src/services/telegram.service');
    const result = await sendTelegramNotification('test message');
    expect(result).toBe(false);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('retorna false si el token es el placeholder', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'your_bot_token_here';
    process.env.TELEGRAM_CHAT_ID = '12345';
    const { sendTelegramNotification } = await import('../../../src/services/telegram.service');
    const result = await sendTelegramNotification('test message');
    expect(result).toBe(false);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('retorna true cuando Telegram responde con 200', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'valid-token';
    process.env.TELEGRAM_CHAT_ID = '12345';

    requestMock.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
      callback(makeSuccessRes(200));
      return mockReqObj;
    });

    const { sendTelegramNotification } = await import('../../../src/services/telegram.service');
    const result = await sendTelegramNotification('test message');
    expect(result).toBe(true);
  });

  it('retorna false cuando Telegram responde con código distinto de 200', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'valid-token';
    process.env.TELEGRAM_CHAT_ID = '12345';

    requestMock.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
      callback(makeSuccessRes(400));
      return mockReqObj;
    });

    const { sendTelegramNotification } = await import('../../../src/services/telegram.service');
    const result = await sendTelegramNotification('test message');
    expect(result).toBe(false);
  });

  it('retorna false cuando ocurre un error de red', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'valid-token';
    process.env.TELEGRAM_CHAT_ID = '12345';

    requestMock.mockImplementation(() => ({
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn().mockImplementation((event: string, handler: (err: Error) => void) => {
        if (event === 'error') setImmediate(() => handler(new Error('network error')));
      }),
    }));

    const { sendTelegramNotification } = await import('../../../src/services/telegram.service');
    const result = await sendTelegramNotification('test message');
    expect(result).toBe(false);
  });

  it('usa el chatId explícito en lugar del definido en la variable de entorno', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'valid-token';
    process.env.TELEGRAM_CHAT_ID = 'env-chat-id';

    let capturedBody = '';
    requestMock.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
      callback(makeSuccessRes(200));
      return {
        write: vi.fn().mockImplementation((data: string) => { capturedBody = data; }),
        end: vi.fn(),
        on: vi.fn(),
      };
    });

    const { sendTelegramNotification } = await import('../../../src/services/telegram.service');
    await sendTelegramNotification('test message', 'explicit-chat-id');

    expect(JSON.parse(capturedBody).chat_id).toBe('explicit-chat-id');
  });
});
