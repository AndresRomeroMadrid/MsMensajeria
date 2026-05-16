# Patrones Avanzados

## Rate Limiting

```typescript
// middleware/rate-limit.middleware.ts
import rateLimit from 'express-rate-limit';
import { env } from '@/config/env';

// Rate limit global
export const rateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: env.NODE_ENV === 'production' ? 100 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many requests, please try again later',
  },
  skip: (req) => req.path === '/health',
});

// Rate limit estricto para auth
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many login attempts, please try again later',
  },
});
```

---

## Upload de archivos con Multer tipado

```typescript
// middleware/upload.middleware.ts
import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';
import path from 'path';
import { AppError } from '@/lib/errors';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number];

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype as AllowedMimeType)) {
    cb(null, true);
  } else {
    cb(new AppError('Only JPEG, PNG and WebP images are allowed', 422, 'INVALID_FILE_TYPE'));
  }
};

export const upload = multer({
  storage: multer.memoryStorage(), // buffer en memoria; usar diskStorage para archivos grandes
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 1,
  },
  fileFilter,
});

// Uso en router:
// router.post('/avatar', authenticate, upload.single('avatar'), userController.uploadAvatar);
```

---

## Logging estructurado con Winston

```typescript
// lib/logger.ts
import winston from 'winston';
import { env } from '@/config/env';

const { combine, timestamp, json, colorize, simple } = winston.format;

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(timestamp(), json()),
  defaultMeta: { service: 'api' },
  transports: [
    new winston.transports.Console({
      format: env.NODE_ENV === 'development'
        ? combine(colorize(), simple())
        : combine(timestamp(), json()),
    }),
    ...(env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
});
```

### Middleware de logging de requests

```typescript
// middleware/request-logger.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '@/lib/logger';
import { randomUUID } from 'crypto';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = randomUUID();
  const start = Date.now();

  // Correlación — útil en logs distribuidos
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP request', {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      userId: req.user?.id,
    });
  });

  next();
};
```

---

## Health Checks

```typescript
// routes/health.router.ts
import { Router } from 'express';
import { prisma } from '@/lib/prisma';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Readiness probe — verifica dependencias
router.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready', db: 'connected', timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'not ready', db: 'disconnected', timestamp: new Date() });
  }
});

export { router as healthRouter };
```

---

## Prisma singleton

```typescript
// lib/prisma.ts
import { PrismaClient } from '@prisma/client';
import { env } from '@/config/env';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development'
      ? ['query', 'warn', 'error']
      : ['warn', 'error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

---

## Paginación reutilizable

```typescript
// lib/pagination.ts
import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

export const getPaginationParams = (query: PaginationQuery) => ({
  skip: (query.page - 1) * query.limit,
  take: query.limit,
});
```

---

## Swagger con zod-to-openapi

```typescript
// lib/openapi.ts
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { createUserSchema } from '@/modules/users/user.schema';

export const registry = new OpenAPIRegistry();

// Registrar schemas
registry.register('CreateUser', createUserSchema);

// Registrar rutas
registry.registerPath({
  method: 'post',
  path: '/api/v1/users',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createUserSchema } } } },
  responses: {
    201: { description: 'User created successfully' },
    422: { description: 'Validation error' },
  },
});

export const generateOpenAPIDocument = () => {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: { title: 'API', version: '1.0.0' },
    servers: [{ url: '/api/v1' }],
  });
};
```

---

## Variables de entorno — ejemplo `.env`

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
JWT_SECRET=super-secret-key-minimum-32-characters-long
JWT_REFRESH_SECRET=another-super-secret-key-minimum-32-chars
JWT_EXPIRES_IN=15m
CORS_ORIGIN=http://localhost:3000
```
