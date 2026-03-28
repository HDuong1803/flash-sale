# Monitoring Standard

## Three Pillars

| Pillar | Tool | Purpose |
|--------|------|---------|
| Logs | Pino + Loki | Structured event records |
| Metrics | Prometheus + Grafana | Numeric measurements over time |
| Traces | OpenTelemetry + Jaeger | Request flow across services |

## Logging Rules

**Log levels**:
- `error` — request failed, data integrity issue, security event
- `warn` — degraded behavior, retry occurred, deprecated usage
- `info` — significant lifecycle events (server start, job complete)
- `debug` — request received, cache hit/miss (development only)
- `trace` — detailed flow tracing (never in production)

**Required fields on every log**:
```typescript
{
  level: string,
  time: ISO8601,
  service: string,  // service name
  traceId: string,  // from request context
  msg: string
}
```

**Never log**:
- Passwords, tokens, API keys
- Credit card numbers, CVV
- SSN, government IDs
- Full request/response bodies on auth endpoints

**Pino configuration**:
```typescript
import pino from 'pino';
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: ['req.headers.authorization', 'body.password', 'body.token'],
});
```

## Metrics Rules

**Naming convention**: `{namespace}_{subsystem}_{name}_{unit}`

Examples:
- `http_requests_total` (counter)
- `http_request_duration_seconds` (histogram)
- `db_connections_active` (gauge)
- `job_processing_duration_seconds` (histogram)

**Required labels**: `method`, `route`, `status_code` on HTTP metrics

**Metric types**:
- Counter: things that only go up (requests, errors, emails sent)
- Gauge: things that go up and down (active connections, queue size)
- Histogram: distributions (request duration, response size)

**Service health via RED method**:
- Rate: requests per second
- Errors: error rate percentage
- Duration: p50, p95, p99 latencies

## Alerting Severity

| Severity | Response | Example |
|---------|---------|---------|
| Critical | Page on-call immediately | Database down, payment failures > 5% |
| High | Respond within 1 hour | Error rate > 1%, p99 latency > 2s |
| Warning | Review next business day | Cache hit rate dropping, job queue growing |

## Health Check Endpoint

Every service must expose:
```typescript
GET /health
// Response
{
  "status": "ok" | "degraded" | "down",
  "version": "1.3.0",
  "uptime": 3600,
  "checks": {
    "database": "ok",
    "redis": "ok",
    "queue": "degraded"
  }
}
```

Return `200` for `ok`, `207` for `degraded`, `503` for `down`.
CI/CD pipelines use `/health` for post-deploy verification.
