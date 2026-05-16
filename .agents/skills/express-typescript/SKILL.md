---
name: express-typescript
description: >
  Experto en desarrollo de APIs y servidores HTTP con Express.js y TypeScript. Usa esta skill
  siempre que el usuario mencione Express, Express.js, APIs REST con Node.js, middlewares,
  routers de Express, controladores, servicios, DTOs, validación con Zod o class-validator,
  autenticación JWT, manejo de errores en Express, testing con Supertest, estructuración de
  proyectos Node.js/TypeScript, tsconfig, decoradores, ORM con Prisma o TypeORM en Express,
  CORS, rate limiting, upload de archivos con multer, WebSockets con Express, o cualquier tarea
  de backend con Node.js tipado. También activa cuando el usuario pida revisar, refactorizar,
  optimizar o depurar código de Express con TypeScript, diseñar la arquitectura de una API,
  implementar capas de repositorio/servicio/controlador, o migrar proyectos de JavaScript a
  TypeScript. No esperes que el usuario diga "Express" explícitamente — si involucra construir
  un servidor HTTP, una API REST o GraphQL con Node.js y TypeScript, usa esta skill.
---

# Express.js + TypeScript Expert Skill

Eres un ingeniero backend senior especializado en Express.js con TypeScript. Tu objetivo es
producir código tipado, mantenible, seguro y listo para producción, siguiendo arquitectura en
capas y principios SOLID.

---

## Flujo de trabajo

1. **Entender el dominio**: qué recurso/funcionalidad se construye, qué capa está involucrada
2. **Proponer estructura antes de codear**: qué archivos crear, qué interfaces definir
3. **Producir código completo**: TypeScript válido, con tipos explícitos, sin `any` innecesario
4. **Aplicar patrones consistentes**: manejo de errores, validación, respuestas HTTP uniformes
5. **Explicar decisiones no obvias**: por qué cierto patrón, qué advertencias tener en cuenta

---

## Estructura de proyecto recomendada

```
src/
├── app.ts                  # Configuración de Express (sin listen)
├── server.ts               # Entry point (listen + graceful shutdown)
├── config/
│   ├── env.ts              # Variables de entorno validadas con Zod
│   └── database.ts         # Conexión a DB
├── routes/
│   └── index.ts            # Registro central de routers
├── modules/
│   └── users/              # Un módulo por recurso
│       ├── user.router.ts
│       ├── user.controller.ts
│       ├── user.service.ts
│       ├── user.repository.ts
│       ├── user.schema.ts      # Validación Zod
│       └── user.types.ts       # Tipos e interfaces
├── middleware/
│   ├── error.middleware.ts
│   ├── auth.middleware.ts
│   ├── validate.middleware.ts
│   └── rate-limit.middleware.ts
├── lib/
│   ├── prisma.ts           # Cliente Prisma singleton
│   ├── logger.ts           # Winston/Pino
│   └── response.ts         # Helpers de respuesta HTTP
└── types/
    └── express.d.ts        # Augmentación de tipos de Express
```

---

## Configuración base

### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### `package.json` — scripts esenciales
```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "lint": "eslint src --ext .ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "express": "^4.18.2",
    "zod": "^3.22.4",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "express-rate-limit": "^7.1.5",
    "winston": "^3.11.0",
    "@prisma/client": "^5.7.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "@types/node": "^20.10.0",
    "typescript": "^5.3.3",
    "tsx": "^4.7.0",
    "vitest": "^1.1.0",
    "supertest": "^6.3.4",
    "@types/supertest": "^6.0.2",
    "prisma": "^5.7.0"
  }
}
```

---

## Patrones fundamentales

### `app.ts` — configuración de Express
```typescript
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimitMiddleware } from '@/middleware/rate-limit.middleware';
import { errorMiddleware } from '@/middleware/error.middleware';
import { registerRoutes } from '@/routes';
import { env } from '@/config/env';

export function createApp(): Application {
  const app = express();

  // Seguridad y parsing
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(rateLimitMiddleware);

  // Rutas
  registerRoutes(app);

  // Error handler (siempre al final)
  app.use(errorMiddleware);

  return app;
}
```

### `server.ts` — entry point con graceful shutdown
```typescript
import { createApp } from './app';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
});

const shutdown = async (signal: string) => {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
  process.exit(1);
});
```

### Validación de env con Zod
```typescript
// config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('*'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
```

---

## Arquitectura en capas

Ver detalles completos en `references/layers.md`

**Resumen de responsabilidades:**
- **Router**: mapea rutas HTTP a controladores, aplica middlewares específicos
- **Controller**: extrae params/body, llama al service, formatea respuesta HTTP
- **Service**: lógica de negocio, orquestación, no conoce HTTP ni DB directamente
- **Repository**: acceso a datos con Prisma/TypeORM, devuelve entidades tipadas

---

## Manejo de errores

```typescript
// lib/errors.ts
export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class ValidationError extends AppError {
  constructor(public readonly errors: Record<string, string[]>) {
    super('Validation failed', 422, 'VALIDATION_ERROR');
  }
}
```

```typescript
// middleware/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      code: 'VALIDATION_ERROR',
      errors: err.flatten().fieldErrors,
    });
    return;
  }

  if (err instanceof ValidationError) {
    res.status(err.statusCode).json({
      success: false,
      code: err.code,
      errors: err.errors,
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error(err);
    res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
    });
    return;
  }

  // Error no manejado
  logger.error('Unexpected error:', err);
  res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  });
}
```

---

## Validación con Zod + middleware

```typescript
// middleware/validate.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

type ValidateTarget = 'body' | 'query' | 'params';

export const validate = (schema: ZodSchema, target: ValidateTarget = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      next(result.error);
      return;
    }
    req[target] = result.data;
    next();
  };
```

---

## Autenticación JWT

Ver `references/auth.md` para implementación completa de:
- Generación y verificación de tokens
- Middleware `authenticate` y `authorize(roles)`
- Refresh tokens con rotación
- Augmentación de `Request` con `req.user`

---

## Respuestas HTTP uniformes

```typescript
// lib/response.ts
import { Response } from 'express';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  meta?: Record<string, unknown>;
}

export const sendSuccess = <T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Record<string, unknown>,
): void => {
  const response: ApiResponse<T> = { success: true, data };
  if (meta) response.meta = meta;
  res.status(statusCode).json(response);
};

export const sendCreated = <T>(res: Response, data: T): void =>
  sendSuccess(res, data, 201);

export const sendNoContent = (res: Response): void => {
  res.status(204).send();
};

// Paginación
export const sendPaginated = <T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
): void => {
  sendSuccess(res, data, 200, {
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  });
};
```

---

## Ejemplo completo: módulo Users

Ver `references/layers.md` para el ejemplo completo con router → controller → service → repository.

---

## Testing con Vitest + Supertest

Ver `references/testing.md` para:
- Setup de app de test aislada
- Tests de integración por endpoint
- Mocks de Prisma con `vitest-mock-extended`
- Tests unitarios de servicios
- Factories de datos de prueba

---

## Patrones avanzados

Ver `references/advanced.md` para:
- Upload de archivos con Multer tipado
- WebSockets con `ws` en Express
- Rate limiting por usuario autenticado
- Cache con Redis (`ioredis`)
- Queue de jobs con BullMQ
- Swagger/OpenAPI automático con `zod-to-openapi`
- Health checks y readiness probes
- Logging estructurado con correlation IDs

---

## Checklist de API lista para producción

- [ ] `strict: true` en tsconfig, sin `any` sin justificación
- [ ] Variables de entorno validadas al arrancar
- [ ] Todos los endpoints validan input con Zod
- [ ] Error handler global captura todos los casos
- [ ] Rutas protegidas usan middleware de autenticación
- [ ] Rate limiting configurado
- [ ] Helmet y CORS configurados correctamente
- [ ] Graceful shutdown implementado
- [ ] Logging estructurado (no `console.log`)
- [ ] Tests de integración para happy path y casos de error
- [ ] `noUnusedLocals` y `noUnusedParameters` activados
- [ ] Respuestas HTTP con formato consistente
- [ ] Códigos de estado HTTP semánticamente correctos
