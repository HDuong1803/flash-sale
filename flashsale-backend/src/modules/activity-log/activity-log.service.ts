import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

export interface LogActivityInput {
  action: string
  userId?: string | null
  ip?: string | null
  targetId?: string | null
}

/**
 * ActivityLogService — writes UserActionLog records fire-and-forget.
 *
 * Design decisions:
 * - `log()` is synchronous from caller's perspective (void return).
 *   The actual DB write is async and errors are swallowed + logged.
 *   This guarantees the main request flow is never blocked or failed
 *   due to audit logging issues.
 * - IP is stored as-is after normalization (IPv4-mapped IPv6 stripped).
 * - No sensitive data is persisted — only action, userId, ip, targetId.
 */
@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name)

  constructor(private readonly prisma: PrismaService) {}

  log(input: LogActivityInput): void {
    void this.prisma.userActionLog
      .create({
        data: {
          action: input.action,
          userId: input.userId || null,
          ip: normalizeIp(input.ip),
          targetId: input.targetId || null
        }
      })
      .catch((err: unknown) => {
        // Never propagate — audit failure must not disrupt the user request
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.warn(`ActivityLog write failed [${input.action}]: ${msg}`)
      })
  }
}

/**
 * Normalize IP address:
 * - Strip IPv4-mapped IPv6 prefix "::ffff:" → "192.168.1.1"
 * - Truncate to 45 chars (schema VarChar(45))
 * - Return null if empty
 */
function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null
  const stripped = raw.replace(/^::ffff:/i, '').trim()
  return stripped.slice(0, 45) || null
}
