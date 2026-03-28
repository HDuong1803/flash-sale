# Stack Setup Reference

**Purpose**: One-time setup procedures and scaffold code for approved technologies.
This is documentation, not rules. See `standards/tech-stack-policy.md` for selection criteria.

---

## PostgreSQL + Prisma

```bash
npm install prisma @prisma/client
npx prisma init
```

`prisma/schema.prisma` conventions:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String    @id @default(uuid()) @db.Uuid
  email     String    @unique @db.VarChar(320)
  name      String    @db.VarChar(100)
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")

  sessions Session[]

  @@map("users")
}
```

---

## Redis + ioredis

```bash
npm install ioredis
```

```typescript
// src/lib/redis.ts
import Redis from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  },
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  },
  async del(key: string): Promise<void> {
    await redis.del(key);
  },
};
```

---

## BullMQ Job Queue

```bash
npm install bullmq
```

```typescript
// src/queues/email.queue.ts
import { Queue, Worker } from 'bullmq';
import { redis } from '../lib/redis';

const connection = redis;

export const emailQueue = new Queue('email.notifications', { connection });

// Worker — separate process
const worker = new Worker(
  'email.notifications',
  async (job) => {
    const { to, subject, body } = job.data;
    await sendEmail({ to, subject, body });
  },
  {
    connection,
    concurrency: 5,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  }
);
```

Queue naming: `{service}.{entity}.{action}` → `email.user.welcome`, `billing.invoice.generate`

---

## Pino Logger

```bash
npm install pino pino-http
```

```typescript
// src/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: ['req.headers.authorization', 'body.password', 'body.token'],
  ...(process.env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
});
```

---

## Zod Validation

```bash
npm install zod
```

```typescript
// src/schemas/auth.schema.ts
import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email().max(320).transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100).trim(),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
```

---

## Express App Bootstrap

```typescript
// src/app.ts
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { globalErrorHandler } from './middleware/error.middleware';
import { authRouter } from './routes/auth.routes';

export const app = express();

app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use('/api/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }));

app.use('/api/v1/auth', authRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: process.env.npm_package_version });
});

app.use(globalErrorHandler);
```

---

## Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: { lines: 80, functions: 80, branches: 70 },
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/index.ts'],
    },
  },
});
```

---

## Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
```
