import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  connectMock,
  createChannelMock,
  assertQueueMock,
  prefetchMock,
  consumeMock,
  ackMock,
  connectionOnMock,
  sendEmailMock,
} = vi.hoisted(() => ({
  connectMock: vi.fn(),
  createChannelMock: vi.fn(),
  assertQueueMock: vi.fn(),
  prefetchMock: vi.fn(),
  consumeMock: vi.fn(),
  ackMock: vi.fn(),
  connectionOnMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock('amqplib', () => ({
  default: { connect: connectMock },
}));

vi.mock('../../../src/services/email.service', () => ({
  sendEmail: sendEmailMock,
}));

import { initGestionConsumer } from '../../../src/consumers/gestion.consumer';

describe('gestion.consumer - initGestionConsumer', () => {
  let consumeHandler: ((msg: any) => Promise<void>) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    consumeHandler = null;

    process.env.RABBITMQ_URL = 'amqp://localhost';

    assertQueueMock.mockResolvedValue({});
    createChannelMock.mockResolvedValue({
      assertQueue: assertQueueMock,
      prefetch: prefetchMock,
      consume: consumeMock,
      ack: ackMock,
    });
    connectMock.mockResolvedValue({
      createChannel: createChannelMock,
      on: connectionOnMock,
    });
    sendEmailMock.mockResolvedValue(true);
    consumeMock.mockImplementation((_queue: string, handler: (msg: any) => Promise<void>) => {
      consumeHandler = handler;
    });
  });

  afterEach(() => {
    delete process.env.RABBITMQ_URL;
    vi.useRealTimers();
  });

  it('retorna sin conectar si RABBITMQ_URL no está definida', async () => {
    delete process.env.RABBITMQ_URL;
    await initGestionConsumer();
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('retorna si todos los reintentos de conexión fallan', async () => {
    connectMock.mockRejectedValue(new Error('connection refused'));
    vi.useFakeTimers();

    const promise = initGestionConsumer();
    await vi.advanceTimersByTimeAsync(25000);
    await promise;

    expect(connectMock).toHaveBeenCalledTimes(5);
  });

  it('procesa mensaje con JSON inválido: hace ack y no envía email', async () => {
    await initGestionConsumer();
    expect(consumeHandler).not.toBeNull();

    const msg = { content: Buffer.from('invalid json') };
    await consumeHandler!(msg);

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(ackMock).toHaveBeenCalledWith(msg);
  });

  it('procesa mensaje sin destinatarios: hace ack y no envía email', async () => {
    await initGestionConsumer();

    const msg = {
      content: Buffer.from(JSON.stringify({
        evaluacionId: 1,
        evaluacionNombre: 'Test',
        destinatarios: [],
      })),
    };
    await consumeHandler!(msg);

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(ackMock).toHaveBeenCalledWith(msg);
  });

  it('envía emails a todos los destinatarios y hace ack al finalizar', async () => {
    await initGestionConsumer();

    const msg = {
      content: Buffer.from(JSON.stringify({
        evaluacionId: 1,
        evaluacionNombre: 'Evaluación Test',
        destinatarios: [
          { email: 'a@test.com', nombreCompleto: 'Alumno A' },
          { email: 'b@test.com', nombreCompleto: 'Alumno B' },
        ],
      })),
    };
    await consumeHandler!(msg);

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendEmailMock).toHaveBeenCalledWith('a@test.com', expect.any(String), expect.any(String));
    expect(sendEmailMock).toHaveBeenCalledWith('b@test.com', expect.any(String), expect.any(String));
    expect(ackMock).toHaveBeenCalledWith(msg);
  });

  it('hace ack incluso cuando sendEmail retorna false', async () => {
    sendEmailMock.mockResolvedValue(false);
    await initGestionConsumer();

    const msg = {
      content: Buffer.from(JSON.stringify({
        evaluacionId: 2,
        evaluacionNombre: 'Test Fallo Email',
        destinatarios: [{ email: 'c@test.com', nombreCompleto: 'Alumno C' }],
      })),
    };
    await consumeHandler!(msg);

    expect(ackMock).toHaveBeenCalledWith(msg);
  });

  it('no llama a ack ni a sendEmail cuando el mensaje del broker es null', async () => {
    await initGestionConsumer();
    await consumeHandler!(null);

    expect(ackMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('registra y puede invocar el handler de error de conexión', async () => {
    let errorHandler: ((err: Error) => void) | null = null;
    connectionOnMock.mockImplementation((event: string, handler: any) => {
      if (event === 'error') errorHandler = handler;
    });

    await initGestionConsumer();

    expect(errorHandler).not.toBeNull();
    expect(() => errorHandler!(new Error('connection failed'))).not.toThrow();
  });

  it('registra y puede invocar el handler de cierre de conexión', async () => {
    let closeHandler: (() => void) | null = null;
    connectionOnMock.mockImplementation((event: string, handler: any) => {
      if (event === 'close') closeHandler = handler;
    });

    await initGestionConsumer();

    expect(closeHandler).not.toBeNull();
    expect(() => closeHandler!()).not.toThrow();
  });
});
