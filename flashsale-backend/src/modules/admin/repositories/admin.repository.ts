import { Injectable } from '@nestjs/common'
import {
  CampaignStatus,
  KycStatus,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
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
        campaignProducts: {
          include: { product: { select: { name: true, originalPrice: true } } }
        },
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

  async getOrdersByTime(
    start: Date,
    end: Date
  ): Promise<Array<{ bucket: string; count: bigint }>> {
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    const groupByHour = diffDays <= 2

    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' }
    })

    const counts = new Map<string, number>()
    for (const { createdAt } of orders) {
      const bucket = groupByHour
        ? `${String(createdAt.getHours()).padStart(2, '0')}:00`
        : `${String(createdAt.getDate()).padStart(2, '0')}/${String(
            createdAt.getMonth() + 1
          ).padStart(2, '0')}`
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
    }

    return Array.from(counts.entries())
      .map(([bucket, count]) => ({ bucket, count: BigInt(count) }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket))
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

  // ─── Orders ─────────────────────────────────────────────────────────

  async findOrders(status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: status ? { status } : undefined,
      include: {
        customer: { select: { fullName: true, email: true } },
        merchant: { select: { businessName: true } },
        items: { select: { productId: true, quantity: true, unitPrice: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    })
  }

  // ─── Payments ────────────────────────────────────────────────────────

  async findPayments(status?: PaymentStatus) {
    return this.prisma.payment.findMany({
      where: status ? { status } : undefined,
      include: {
        reservation: { select: { customerId: true, campaignProductId: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    })
  }

  // ─── Products ────────────────────────────────────────────────────────

  async findProducts(status?: ProductStatus) {
    return this.prisma.product.findMany({
      where: status ? { status } : undefined,
      include: {
        merchant: { select: { businessName: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    })
  }

  // ─── Customer Profiles ───────────────────────────────────────────────

  async findCustomerProfiles() {
    return this.prisma.customerProfile.findMany({
      include: {
        user: { select: { email: true, fullName: true, status: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    })
  }

  // ─── Notifications ───────────────────────────────────────────────────

  async findNotifications() {
    return this.prisma.notification.findMany({
      include: {
        user: { select: { fullName: true, email: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    })
  }

  // ─── Stock Audit Logs ────────────────────────────────────────────────

  async findStockAuditLogs() {
    return this.prisma.stockAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100
    })
  }

  // ─── User Action Logs ────────────────────────────────────────────────

  async findUserActionLogs() {
    return this.prisma.userActionLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100
    })
  }

  // ─── Outbox Events ───────────────────────────────────────────────────

  async findOutboxEvents() {
    return this.prisma.outboxEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100
    })
  }

  // ─── Finance / Commission Dashboard ───────────────────────────────────

  async getFinanceSummary() {
    const [agg, orders] = await Promise.all([
      this.prisma.commissionLedger.aggregate({
        _sum: {
          grossAmount: true,
          commissionAmount: true,
          netAmount: true
        },
        _count: { _all: true }
      }),
      this.prisma.commissionLedger.findMany({
        select: { commissionRate: true }
      })
    ])

    const avgRate =
      orders.length > 0
        ? orders.reduce((acc, item) => acc + Number(item.commissionRate), 0) / orders.length
        : 0

    return {
      grossRevenue: Number(agg._sum.grossAmount ?? 0),
      commissionRevenue: Number(agg._sum.commissionAmount ?? 0),
      merchantNetRevenue: Number(agg._sum.netAmount ?? 0),
      averageCommissionRatePct: Math.round(avgRate * 10000) / 100,
      totalCommissionOrders: agg._count._all
    }
  }

  async getFinanceTrend(days = 7) {
    const dayStarts = Array.from({ length: days }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (days - 1 - i))
      d.setHours(0, 0, 0, 0)
      return d
    })

    return Promise.all(
      dayStarts.map(async dayStart => {
        const dayEnd = new Date(dayStart)
        dayEnd.setDate(dayEnd.getDate() + 1)
        const result = await this.prisma.commissionLedger.aggregate({
          where: { createdAt: { gte: dayStart, lt: dayEnd } },
          _sum: { commissionAmount: true, grossAmount: true }
        })
        return {
          dayStart,
          commissionRevenue: Number(result._sum.commissionAmount ?? 0),
          grossRevenue: Number(result._sum.grossAmount ?? 0)
        }
      })
    )
  }

  async getFinanceCategoryBreakdown() {
    const ledgers = await this.prisma.commissionLedger.findMany({
      include: { commissionCategory: true }
    })

    const grouped = new Map<
      string,
      {
        categoryId: string
        code: string
        name: string
        defaultRate: number
        commissionRevenue: number
        grossRevenue: number
        orders: number
      }
    >()

    for (const item of ledgers) {
      const category = item.commissionCategory
      const key = category?.id ?? 'uncategorized'
      const current = grouped.get(key)
      if (current) {
        current.commissionRevenue += Number(item.commissionAmount)
        current.grossRevenue += Number(item.grossAmount)
        current.orders += 1
      } else {
        grouped.set(key, {
          categoryId: category?.id ?? 'uncategorized',
          code: category?.code ?? 'UNCATEGORIZED',
          name: category?.name ?? 'Chưa phân loại',
          defaultRate: Number(category?.defaultRate ?? 0),
          commissionRevenue: Number(item.commissionAmount),
          grossRevenue: Number(item.grossAmount),
          orders: 1
        })
      }
    }

    return Array.from(grouped.values()).sort(
      (a, b) => b.commissionRevenue - a.commissionRevenue
    )
  }
}
