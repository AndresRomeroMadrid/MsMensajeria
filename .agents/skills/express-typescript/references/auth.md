# Autenticación JWT — Implementación Completa

## Tipos y esquemas

```typescript
// modules/auth/auth.schema.ts
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type LoginDto = z.infer<typeof loginSchema>;
```

---

## JWT helpers

```typescript
// lib/jwt.ts
import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '@/config/env';
import { UnauthorizedError } from './errors';

export interface TokenPayload {
  sub: string;       // user id
  email: string;
  role: string;
  type: 'access' | 'refresh';
}

export const signAccessToken = (payload: Omit<TokenPayload, 'type'>): string =>
  jwt.sign({ ...payload, type: 'access' }, env.JWT_SECRET, {
    expiresIn: '15m',
  } as SignOptions);

export const signRefreshToken = (payload: Omit<TokenPayload, 'type'>): string =>
  jwt.sign({ ...payload, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: '30d',
  } as SignOptions);

export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
};
```

---

## Middleware de autenticación

```typescript
// middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '@/lib/jwt';
import { UnauthorizedError, ForbiddenError } from '@/lib/errors';
import { UserRole } from '@/modules/users/user.types';

export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing authorization header'));
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    if (payload.type !== 'access') {
      next(new UnauthorizedError('Invalid token type'));
      return;
    }
    req.user = { id: payload.sub, email: payload.email, role: payload.role as UserRole };
    next();
  } catch (err) {
    next(err);
  }
};

export const authorize = (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }
    next();
  };
```

---

## Auth Service

```typescript
// modules/auth/auth.service.ts
import bcrypt from 'bcryptjs';
import { userRepository } from '@/modules/users/user.repository';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '@/lib/jwt';
import { UnauthorizedError } from '@/lib/errors';
import { LoginDto } from './auth.schema';

export const authService = {
  async login(dto: LoginDto) {
    const user = await userRepository.findByEmail(dto.email);

    if (!user) throw new UnauthorizedError('Invalid credentials');

    const validPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!validPassword) throw new UnauthorizedError('Invalid credentials');

    const tokenPayload = { sub: user.id, email: user.email, role: user.role };

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      accessToken: signAccessToken(tokenPayload),
      refreshToken: signRefreshToken(tokenPayload),
    };
  },

  async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);

    if (payload.type !== 'refresh') throw new UnauthorizedError('Invalid token type');

    // Verificar que el usuario aún existe y está activo
    const user = await userRepository.findById(payload.sub);
    if (!user) throw new UnauthorizedError('User not found');

    const tokenPayload = { sub: user.id, email: user.email, role: user.role };

    return {
      accessToken: signAccessToken(tokenPayload),
      refreshToken: signRefreshToken(tokenPayload), // rotación
    };
  },

  async me(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new UnauthorizedError('User not found');
    return user;
  },
};
```

---

## Auth Router

```typescript
// modules/auth/auth.router.ts
import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '@/middleware/validate.middleware';
import { authenticate } from '@/middleware/auth.middleware';
import { loginSchema, refreshSchema } from './auth.schema';

const router = Router();

router.post('/login', validate(loginSchema), authController.login);
router.post('/refresh', validate(refreshSchema), authController.refresh);
router.get('/me', authenticate, authController.me);
router.post('/logout', authenticate, authController.logout);

export { router as authRouter };
```

---

## Auth Controller

```typescript
// modules/auth/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { sendSuccess } from '@/lib/response';

export const authController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.login(req.body);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const tokens = await authService.refresh(req.body.refreshToken);
      sendSuccess(res, tokens);
    } catch (err) {
      next(err);
    }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await authService.me(req.user!.id);
      sendSuccess(res, user);
    } catch (err) {
      next(err);
    }
  },

  async logout(_req: Request, res: Response) {
    // Con JWT stateless: el cliente descarta el token
    // Para blacklisting real: guardar token en Redis con TTL
    res.status(204).send();
  },
};
```
