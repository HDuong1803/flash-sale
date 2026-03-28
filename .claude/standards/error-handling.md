# Error Handling Standard

## Core Principles

1. Never swallow errors with empty catch blocks
2. Centralize error formatting in one global handler
3. All error responses use the same JSON envelope
4. Distinguish operational errors (expected) from programmer errors (unexpected)
5. Operational errors are safe to send to the client with context; programmer errors return 500

## AppError — Base Domain Error

```typescript
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public code: string,
    public isOperational = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR');
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
  constructor(resource: string) {
    super(`${resource} already exists`, 409, 'CONFLICT');
  }
}
```

## Async Error Propagation

In NestJS, throw domain exceptions from services/controllers and centralize response mapping
in global exception filters. Avoid per-handler ad hoc error formatting.

```typescript
@Injectable()
export class UsersService {
  async findById(id: string) {
    const user = await this.repo.findById(id)
    if (!user) {
      throw new NotFoundError('User')
    }
    return user
  }
}
```

## Global Error Handler (NestJS Exception Filter)

```typescript
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    if (exception instanceof AppError && exception.isOperational) {
      response.status(exception.statusCode).json({
        success: false,
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception instanceof ValidationError && exception.details
            ? { details: exception.details }
            : {}),
        },
      })
      return
    }

    response.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    })
  }
}
```

## Zod Validation Error Handling

```typescript
import { ZodError } from 'zod';

export const parseBody = <T>(schema: ZodSchema<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Request validation failed', result.error.flatten().fieldErrors);
  }
  return result.data;
};
```

## Rules

- Every service method that can fail must throw a specific `AppError` subclass, not a generic `Error`
- Never throw strings or plain objects
- Never log a caught error and re-throw a generic error (lose the original stack trace)
- Never catch and ignore errors unless the failure is genuinely safe to ignore (document why)
- Database constraint violations must be caught at the repository layer and converted to domain errors
