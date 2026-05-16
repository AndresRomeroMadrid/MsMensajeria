# Testing con Vitest + Supertest

## Setup base

```typescript
// src/test/setup.ts
import { vi } from 'vitest';

// Mock global de Prisma — evita conexión real a DB en tests
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
    $disconnect: vi.fn(),
  },
}));
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['node_modules', 'dist', 'src/test'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
```

---

## Factories de datos

```typescript
// src/test/factories.ts
import { User } from '@/modules/users/user.types';

let idCounter = 0;

export const createUserFactory = (overrides: Partial<User> = {}): User => ({
  id: `user-${++idCounter}`,
  email: `user${idCounter}@example.com`,
  name: `Test User ${idCounter}`,
  role: 'user',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const adminFactory = (overrides: Partial<User> = {}): User =>
  createUserFactory({ role: 'admin', ...overrides });
```

---

## Tests de integración (Supertest)

```typescript
// modules/users/__tests__/user.integration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app';
import { prisma } from '@/lib/prisma';
import { createUserFactory } from '@/test/factories';
import { signAccessToken } from '@/lib/jwt';

const app = createApp();

// Token de prueba reutilizable
const makeToken = (role = 'user', id = 'user-1') =>
  signAccessToken({ sub: id, email: 'test@test.com', role });

describe('Users API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/users', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/users');
      expect(res.status).toBe(401);
    });

    it('returns paginated users for authenticated user', async () => {
      const mockUsers = [createUserFactory(), createUserFactory()];
      vi.mocked(prisma.$transaction).mockResolvedValue([mockUsers, 2]);

      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.pagination.total).toBe(2);
    });

    it('filters by role query param', async () => {
      vi.mocked(prisma.$transaction).mockResolvedValue([[], 0]);

      await request(app)
        .get('/api/v1/users?role=admin')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(prisma.$transaction).toHaveBeenCalledOnce();
    });

    it('returns 422 for invalid query params', async () => {
      const res = await request(app)
        .get('/api/v1/users?limit=999')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/v1/users/:id', () => {
    it('returns user by id', async () => {
      const mockUser = createUserFactory({ id: 'cuid1234567890abcdef' });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);

      const res = await request(app)
        .get(`/api/v1/users/${mockUser.id}`)
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(mockUser.id);
    });

    it('returns 404 for non-existent user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/users/cuid1234567890abcdef')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/v1/users', () => {
    it('creates user (admin only)', async () => {
      const newUser = createUserFactory();
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null); // email free
      vi.mocked(prisma.user.create).mockResolvedValue(newUser as any);

      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${makeToken('admin')}`)
        .send({
          email: 'new@example.com',
          name: 'New User',
          password: 'Password123',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('returns 403 for non-admin user', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${makeToken('user')}`)
        .send({ email: 'new@example.com', name: 'New', password: 'Password123' });

      expect(res.status).toBe(403);
    });

    it('returns 422 for invalid body', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${makeToken('admin')}`)
        .send({ email: 'not-an-email', name: 'X', password: '123' });

      expect(res.status).toBe(422);
      expect(res.body.errors).toBeDefined();
    });

    it('returns 409 when email is taken', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'existing' } as any);

      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${makeToken('admin')}`)
        .send({ email: 'taken@example.com', name: 'Name', password: 'Password123' });

      expect(res.status).toBe(409);
    });
  });

  describe('DELETE /api/v1/users/:id', () => {
    it('deletes user (admin only)', async () => {
      const user = createUserFactory({ id: 'cuid1234567890abcdef' });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);
      vi.mocked(prisma.user.delete).mockResolvedValue({ id: user.id } as any);

      const res = await request(app)
        .delete(`/api/v1/users/${user.id}`)
        .set('Authorization', `Bearer ${makeToken('admin')}`);

      expect(res.status).toBe(204);
    });
  });
});
```

---

## Tests unitarios de servicios

```typescript
// modules/users/__tests__/user.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { userService } from '../user.service';
import { userRepository } from '../user.repository';
import { NotFoundError, ConflictError } from '@/lib/errors';
import { createUserFactory } from '@/test/factories';

vi.mock('../user.repository');

describe('userService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getById', () => {
    it('returns user when found', async () => {
      const mockUser = createUserFactory();
      vi.mocked(userRepository.findById).mockResolvedValue(mockUser);

      const result = await userService.getById(mockUser.id);

      expect(result).toEqual(mockUser);
      expect(userRepository.findById).toHaveBeenCalledWith(mockUser.id);
    });

    it('throws NotFoundError when user does not exist', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(null);

      await expect(userService.getById('ghost-id')).rejects.toThrow(NotFoundError);
    });
  });

  describe('create', () => {
    it('hashes password before saving', async () => {
      const mockUser = createUserFactory();
      vi.mocked(userRepository.existsByEmail).mockResolvedValue(false);
      vi.mocked(userRepository.create).mockResolvedValue(mockUser);

      await userService.create({
        email: 'new@test.com',
        name: 'Test',
        password: 'Password123',
        role: 'user',
      });

      const createCall = vi.mocked(userRepository.create).mock.calls[0][0];
      expect(createCall).toHaveProperty('passwordHash');
      expect(createCall.passwordHash).not.toBe('Password123');
    });

    it('throws ConflictError when email is taken', async () => {
      vi.mocked(userRepository.existsByEmail).mockResolvedValue(true);

      await expect(
        userService.create({ email: 'taken@test.com', name: 'Test', password: 'Pass123' }),
      ).rejects.toThrow(ConflictError);
    });
  });
});
```
