import { Injectable } from '@nestjs/common'
import {
  CampaignStatus,
  KycStatus,
  OrderStatus,
  UserRole,
  UserStatus
} from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Merchants ──────────────────────────────────────────────────────

  async findMerchants(status?: KycStatus) {
    return this.prisma.merchantProfile.findMany({
      where: status ? { kycStatus: status } : undefined,
      include: {
        user: { select: { email: true, fullName: true, createdAt: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  async findMerchantById(id: string) {
    return this.prisma.merchantProfile.findUnique({ where: { id } })
  }

  async approveMerchant(merchantId: string, userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.merchantProfile.update({
        where: { id: merchantId },
        data: { kycStatus: KycStatus.APPROVED }
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { role: UserRole.MERCHANT }
      })
    ])
  }

  async rejectMerchant(merchantId: string, reason: string) {
    return this.prisma.merchantProfile.update({
      where: { id: merchantId },
      data: { kycStatus: KycStatus.REJECTED, rejectionReason: reason }
    })
  }

  // ─── Campaigns ──────────────────────────────────────────────────────

  async findCampaigns(status?: CampaignStatus) {
    return this.prisma.campaign.findMany({
      where: status ? { status } : undefined,
      include: {
        merchant: { select: { businessName: true } },
        campaignProducts: { include: { product: { select: { name: true } } } },
        _count: { select: { campaignProducts: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  async updateCampaignStatus(id: string, status: CampaignStatus) {
    return this.prisma.campaign.update({
      where: { id },
      data: { status }
    })
  }

  // ─── Users ──────────────────────────────────────────────────────────

  async findUsers(filters: {
    role?: UserRole
    search?: string
    page: number
    limit: number
  }) {
    return this.prisma.user.findMany({
      where: {
        ...(filters.role ? { role: filters.role } : {}),
        ...(filters.search
          ? {
              OR: [
                { email: { contains: filters.search, mode: 'insensitive' } },
                { fullName: { contains: filters.search, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit
    })
  }

  async updateUserStatus(userId: string, status: UserStatus) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status }
    })
  }

  // ─── Statistics ─────────────────────────────────────────────────────

  async getStats() {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [
      totalUsers,
      activeMerchants,
      liveCampaigns,
      ordersToday,
      revenueResult,
      failedJobs
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.merchantProfile.count({
        where: { kycStatus: KycStatus.APPROVED }
      }),
      this.prisma.campaign.count({ where: { status: CampaignStatus.ACTIVE } }),
      this.prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.order.aggregate({
        where: {
          createdAt: { gte: todayStart },
          status: { not: OrderStatus.CANCELLED }
        },
        _sum: { totalAmount: true }
      }),
      this.prisma.deadLetterJob.count()
    ])

    return {
      totalUsers,
      activeMerchants,
      liveCampaigns,
      ordersToday,
      revenueToday: Number(revenueResult._sum.totalAmount ?? 0),
      failedJobs
    }
  }

  async getOrdersByHour(): Promise<Array<{ hour: number; count: bigint }>> {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    return this.prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`
      SELECT EXTRACT(HOUR FROM "createdAt") as hour, COUNT(*) as count
      FROM "Order"
      WHERE "createdAt" >= ${todayStart}
      GROUP BY hour ORDER BY hour
    `
  }

  async getRevenueTrend(): Promise<Array<{ dayStart: Date; revenue: number }>> {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      d.setHours(0, 0, 0, 0)
      return d
    })

    return Promise.all(
      days.map(async dayStart => {
        const dayEnd = new Date(dayStart)
        dayEnd.setDate(dayEnd.getDate() + 1)
        const result = await this.prisma.order.aggregate({
          where: {
            createdAt: { gte: dayStart, lt: dayEnd },
            status: { not: OrderStatus.CANCELLED }
          },
          _sum: { totalAmount: true }
        })
        return { dayStart, revenue: Number(result._sum.totalAmount ?? 0) }
      })
    )
  }

  async getActivity() {
    const [recentOrders, recentApprovals] = await Promise.all([
      this.prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { customer: { select: { fullName: true } } }
      }),
      this.prisma.merchantProfile.findMany({
        where: { kycStatus: KycStatus.APPROVED },
        take: 5,
        orderBy: { updatedAt: 'desc' },
        include: { user: { select: { fullName: true } } }
      })
    ])

    return { recentOrders, recentApprovals }
  }

  // ─── Dead Letter Queue ───────────────────────────────────────────────

  async findDeadLetterJobs() {
    return this.prisma.deadLetterJob.findMany({ orderBy: { failedAt: 'desc' } })
  }

  async findDeadLetterJobById(id: string) {
    return this.prisma.deadLetterJob.findUnique({ where: { id } })
  }

  async incrementJobRetryCount(id: string): Promise<void> {
    await this.prisma.deadLetterJob.update({
      where: { id },
      data: { retryCount: { increment: 1 } }
    })
  }

  async deleteDeadLetterJob(id: string): Promise<void> {
    await this.prisma.deadLetterJob.delete({ where: { id } })
  }
}
