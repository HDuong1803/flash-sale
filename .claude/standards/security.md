# Security Standard

## CRITICAL — Never Do

- Hardcode secrets, API keys, tokens, or passwords in source code
- Commit `.env` files (only commit `.env.example` with placeholder values)
- Log passwords, tokens, PII, payment card data, or API keys
- Use `eval()` or `new Function()` with user-controlled input
- Store passwords in plain text or with MD5/SHA-1
- Trust client-supplied IDs for authorization without server-side ownership verification

## Secrets Management

All secrets via environment variables. `.env.example` documents required variables with
placeholder values. Secrets rotate via the deployment environment (GitHub Actions secrets,
Railway, etc.) — never through code commits.

```bash
# .env.example (committed)
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
JWT_SECRET=replace-with-32-char-random-string
REDIS_URL=redis://localhost:6379

# .env (never committed — in .gitignore)
DATABASE_URL=postgresql://realuser:realpass@prod-host:5432/proddb
```

## Input Validation

Validate all external input at the system boundary (route/controller layer).
No raw input ever reaches the service or database layer.

Use the validation model already present in the module (class-validator/class-transformer and Joi where configured):
```typescript
export class CreateUserDto {
  @IsEmail()
  email: string

  @IsString()
  @MinLength(8)
  password: string
}
```

## Authentication

**Password hashing**: bcrypt with minimum 12 rounds.
```typescript
const BCRYPT_ROUNDS = 12;
const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
const valid = await bcrypt.compare(password, hash);
```

**JWT**: short-lived access tokens (15 minutes) + refresh tokens (7 days).
Store refresh tokens in database (allows revocation). Verify `iss`, `aud`, `exp` claims.
```typescript
const token = jwt.sign(
  { sub: user.id, email: user.email },
  process.env.JWT_SECRET,
  { expiresIn: '15m', issuer: 'app-name', audience: 'app-name' }
);
```

## Authorization

Check permissions on every protected route. Two checks required:
1. User is authenticated (valid JWT)
2. User has permission for this specific resource (row-level ownership check)

```typescript
// Never skip the ownership check
const resource = await resourceRepo.findById(id);
if (!resource) throw new NotFoundError('Resource');
if (resource.userId !== req.user.id) throw new ForbiddenError();
```

## HTTP Security Headers

Use security headers middleware on all API servers (`helmet` equivalent in NestJS bootstrap):
```typescript
import helmet from 'helmet';
app.use(helmet()); // sets 11 security headers by default
```

Additional headers for API-only servers:
```typescript
app.use(helmet.contentSecurityPolicy({
  directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] }
}));
```

## Rate Limiting

Apply rate limiting to all public endpoints:
```typescript
// In NestJS, use ThrottlerGuard globally and override stricter limits for auth routes.
// Keep equivalent policy:
// - General API: 100 requests / 15 minutes
// - Auth endpoints: 10 requests / 15 minutes
```

## SQL Injection Prevention

Never construct SQL with string concatenation. Always use ORM or parameterized queries:
```typescript
// WRONG — SQL injection vulnerability
const user = await db.raw(`SELECT * FROM users WHERE email = '${email}'`);

// CORRECT — parameterized
const user = await db('users').where({ email }).first();
// or with raw when necessary:
const user = await db.raw('SELECT * FROM users WHERE email = ?', [email]);
```

## OWASP Top 10 Checklist (Per Feature)

- [ ] A01 Broken Access Control — ownership check on every resource access
- [ ] A02 Cryptographic Failures — no plaintext secrets, bcrypt for passwords
- [ ] A03 Injection — parameterized queries, validated inputs
- [ ] A04 Insecure Design — threat model reviewed for new flows
- [ ] A05 Security Misconfiguration — helmet, no default credentials
- [ ] A06 Vulnerable Components — `npm audit` passes with no critical/high
- [ ] A07 Auth Failures — JWT verified, rate limiting on auth endpoints
- [ ] A08 Data Integrity — signed JWTs, no untrusted deserialization
- [ ] A09 Logging Failures — errors logged, no sensitive data in logs
- [ ] A10 SSRF — external URLs validated/allowlisted before fetch
