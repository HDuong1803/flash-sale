import { Injectable } from '@nestjs/common'
import { PrismaService } from '@infrastructure/prisma/prisma.service'
import { FraudQueryDto, FraudStatsDto, TopIpEntryDto } from '../dto/fraud.dto'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateFraudEventData {
  userId?: string
  ipAddress: string
  userAgent: string
  requestType: string
  riskScore: number
  blocked: boolean
  blockReason?: string
  triggeredRules: string[]
  signals: Record<string, unknown>
  campaignId?: string
}

export interface ActiveBlacklistEntry {
  expiresAt: Date | null
}

@Injectable()
export class FraudRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lưu một sự kiện đánh giá fraud mới vào cơ sở dữ liệu.
   */
  async createEvent(data: CreateFraudEventData) {
    return this.prisma.fraudEvent.create({
      data: {
        userId: data.userId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        requestType: data.requestType,
        riskScore: data.riskScore,
        blocked: data.blocked,
        blockReason: data.blockReason,
        triggeredRules: data.triggeredRules,
        signals: data.signals as object,
        campaignId: data.campaignId
      }
    })
  }

  /**
   * Tính toán thống kê tổng hợp cho khoảng thời gian cho trước:
   * tổng sự kiện, số bị block, tỉ lệ block, và top 10 IP bị block nhiều nhất.
   */
  async getStats(since: Date): Promise<FraudStatsDto> {
    const [total, blocked] = await this.prisma.$transaction([
      this.prisma.fraudEvent.count({
        where: { createdAt: { gte: since } }
      }),
      this.prisma.fraudEvent.count({
        where: { createdAt: { gte: since }, blocked: true }
      })
    ])

    // Dùng raw query vì Prisma groupBy có vấn đề type inference với having clause
    const topIpRows = await this.prisma.$queryRaw<
      { ip_address: string; cnt: bigint }[]
    >`
      SELECT ip_address, COUNT(*) AS cnt
      FROM fraud_events
      WHERE created_at >= ${since} AND blocked = true
      GROUP BY ip_address
      ORDER BY cnt DESC
      LIMIT 10
    `

    const topIps: TopIpEntryDto[] = topIpRows.map(r => ({
      ip: r.ip_address,
      count: Number(r.cnt)
    }))

    return {
      total,
      blocked,
      blockRate: total > 0 ? blocked / total : 0,
      topIps
    }
  }

  /**
   * Trả về danh sách phân trang các sự kiện fraud, có thể lọc theo trạng thái blocked.
   */
  async getEvents(
    query: FraudQueryDto
  ): Promise<{ data: unknown[]; total: number }> {
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const skip = (page - 1) * limit

    const where =
      query.blocked !== undefined ? { blocked: query.blocked } : undefined

    const [data, total] = await this.prisma.$transaction([
      this.prisma.fraudEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      this.prisma.fraudEvent.count({ where })
    ])

    return { data, total }
  }

  /**
   * Upsert hồ sơ rủi ro tổng hợp cho một user.
   * Tăng totalAttempts và tùy chọn tăng blockedCount nếu bị block.
   */
  async upsertRiskProfile(
    userId: string,
    riskScore: number,
    blocked: boolean
  ): Promise<void> {
    await this.prisma.userRiskProfile.upsert({
      where: { userId },
      update: {
        riskScore,
        totalAttempts: { increment: 1 },
        blockedCount: blocked ? { increment: 1 } : undefined
      },
      create: {
        userId,
        riskScore,
        totalAttempts: 1,
        blockedCount: blocked ? 1 : 0
      }
    })
  }

  /**
   * Tạo mới hoặc làm mới một bản ghi IP blacklist.
   * Nếu có hours, expiresAt = now + hours; ngược lại entry là vĩnh viễn.
   */
  async addToBlacklist(
    ip: string,
    reason: string,
    adminId: string,
    hours?: number
  ): Promise<void> {
    const expiresAt = hours
      ? new Date(Date.now() + hours * 60 * 60 * 1000)
      : null

    await this.prisma.ipBlacklist.upsert({
      where: { ipAddress: ip },
      update: { reason, expiresAt, createdBy: adminId },
      create: { ipAddress: ip, reason, expiresAt, createdBy: adminId }
    })
  }

  /**
   * Xóa một IP khỏi danh sách blacklist.
   */
  async removeFromBlacklist(ip: string): Promise<void> {
    await this.prisma.ipBlacklist.deleteMany({
      where: { ipAddress: ip }
    })
  }

  /**
   * Trả về tất cả bản ghi blacklist còn hiệu lực (vĩnh viễn + tạm thời chưa hết hạn).
   */
  async getBlacklist() {
    return this.prisma.ipBlacklist.findMany({
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  /**
   * Kiểm tra IP có đang trong blacklist không (còn hiệu lực, chưa hết hạn).
   */
  async findActiveBlacklistEntry(
    ip: string
  ): Promise<ActiveBlacklistEntry | null> {
    return this.prisma.ipBlacklist.findFirst({
      where: {
        ipAddress: ip,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      },
      select: { expiresAt: true }
    })
  }

  async isBlacklisted(ip: string): Promise<boolean> {
    const entry = await this.findActiveBlacklistEntry(ip)
    return entry !== null
  }
}
