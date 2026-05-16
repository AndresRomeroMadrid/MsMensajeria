# Arquitectura en Capas — Ejemplo Completo

## Módulo: Users

### `user.types.ts` — interfaces y tipos del dominio

```typescript
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 'admin' | 'user';

// Lo que se expone en la API (sin password)
export type UserPublic = Omit<User, 'passwordHash'>;

export interface CreateUserDto {
  email: string;
  name: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserDto {
  name?: string;
  email?: string;
}

export interface ListUsersQuery {
  page?: number;
  limit?: number;
  role?: UserRole;
  search?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
```

---

### `user.schema.ts` — esquemas Zod de validación

```typescript
import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase(),
  name: z.string().min(2, 'Nombre muy corto').max(100).trim(),
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Debe contener mayúscula')
    .regex(/[0-9]/, 'Debe contener número'),
  role: z.enum(['admin', 'user']).default('user'),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  email: z.string().email().toLowerCase().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' }
);

export const listUsersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(['admin', 'user']).optional(),
  search: z.string().max(100).optional(),
});

export const userIdSchema = z.object({
  id: z.string().cuid('ID inválido'),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersSchema>;
```

---

### `user.repository.ts` — acceso a datos con Prisma

```typescript
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { CreateUserDto, UpdateUserDto, ListUsersQuery, PaginatedResult } from './user.types';

// Selector reutilizable — nunca exponer passwordHash
const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export const userRepository = {
  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
  },

  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      select: { ...userSelect, passwordHash: true }, // solo para auth
    });
  },

  async findMany({ page, limit, role, search }: ListUsersQuery): Promise<PaginatedResult<typeof userSelect>> {
    const where: Prisma.UserWhereInput = {
      ...(role && { role }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: userSelect,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return { data, total, page, limit };
  },

  async create(data: CreateUserDto & { passwordHash: string }) {
    const { password: _, ...rest } = data as any;
    return prisma.user.create({
      data: rest,
      select: userSelect,
    });
  },

  async update(id: string, data: UpdateUserDto) {
    return prisma.user.update({
      where: { id },
      data,
      select: userSelect,
    });
  },

  async delete(id: string) {
    return prisma.user.delete({
      where: { id },
      select: { id: true },
    });
  },

  async existsByEmail(email: string, excludeId?: string) {
    const user = await prisma.user.findFirst({
      where: { email, ...(excludeId && { NOT: { id: excludeId } }) },
      select: { id: true },
    });
    return !!user;
  },
};
```

---

### `user.service.ts` — lógica de negocio

```typescript
import bcrypt from 'bcryptjs';
import { userRepository } from './user.repository';
import { CreateUserDto, UpdateUserDto, ListUsersQuery } from './user.types';
import { NotFoundError, ConflictError } from '@/lib/errors';

export const userService = {
  async getById(id: string) {
    const user = await userRepository.findById(id);
    if (!user) throw new NotFoundError('User');
    return user;
  },

  async list(query: ListUsersQuery) {
    return userRepository.findMany(query);
  },

  async create(dto: CreateUserDto) {
    const emailTaken = await userRepository.existsByEmail(dto.email);
    if (emailTaken) throw new ConflictError('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    return userRepository.create({ ...dto, passwordHash });
  },

  async update(id: string, dto: UpdateUserDto) {
    const user = await userRepository.findById(id);
    if (!user) throw new NotFoundError('User');

    if (dto.email && dto.email !== user.email) {
      const emailTaken = await userRepository.existsByEmail(dto.email, id);
      if (emailTaken) throw new ConflictError('Email already in use');
    }

    return userRepository.update(id, dto);
  },

  async delete(id: string) {
    const user = await userRepository.findById(id);
    if (!user) throw new NotFoundError('User');
    await userRepository.delete(id);
  },
};
```

---

### `user.controller.ts` — capa HTTP

```typescript
import { Request, Response, NextFunction } from 'express';
import { userService } from './user.service';
import { sendSuccess, sendCreated, sendNoContent, sendPaginated } from '@/lib/response';

export const userController = {
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await userService.getById(req.params.id);
      sendSuccess(res, user);
    } catch (err) {
      next(err);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { data, total, page, limit } = await userService.list(req.query as any);
      sendPaginated(res, data, total, page, limit);
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await userService.create(req.body);
      sendCreated(res, user);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await userService.update(req.params.id, req.body);
      sendSuccess(res, user);
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await userService.delete(req.params.id);
      sendNoContent(res);
    } catch (err) {
      next(err);
    }
  },
};
```

---

### `user.router.ts` — rutas y middlewares

```typescript
import { Router } from 'express';
import { userController } from './user.controller';
import { validate } from '@/middleware/validate.middleware';
import { authenticate, authorize } from '@/middleware/auth.middleware';
import {
  createUserSchema,
  updateUserSchema,
  listUsersSchema,
  userIdSchema,
} from './user.schema';

const router = Router();

router
  .route('/')
  .get(authenticate, validate(listUsersSchema, 'query'), userController.list)
  .post(authenticate, authorize('admin'), validate(createUserSchema), userController.create);

router
  .route('/:id')
  .get(authenticate, validate(userIdSchema, 'params'), userController.getById)
  .patch(
    authenticate,
    validate(userIdSchema, 'params'),
    validate(updateUserSchema),
    userController.update,
  )
  .delete(
    authenticate,
    authorize('admin'),
    validate(userIdSchema, 'params'),
    userController.delete,
  );

export { router as userRouter };
```

---

### `routes/index.ts` — registro central

```typescript
import { Application } from 'express';
import { userRouter } from '@/modules/users/user.router';
import { authRouter } from '@/modules/auth/auth.router';

export function registerRoutes(app: Application): void {
  const API_PREFIX = '/api/v1';

  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }));

  app.use(`${API_PREFIX}/auth`, authRouter);
  app.use(`${API_PREFIX}/users`, userRouter);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Route not found' });
  });
}
```

---

## Augmentación de tipos de Express

```typescript
// src/types/express.d.ts
import { UserRole } from '@/modules/users/user.types';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
      };
    }
  }
}
```
