import { Injectable } from '@nestjs/common'
import {
  CampaignStatus,
  KycStatus,
  OrderStatus,
  PaymentStatus,
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

  async getMerchantOverview(merchantId: string, days: number) {
    const merchant = await this.prisma.merchantProfile.findUnique({
      where: { id: merchantId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            status: true,
            lastLoginAt: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    })

    if (!merchant) return null

    const now = new Date()
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

    const [
      productsTotal,
      activeProducts,
      reservationsTotal,
      ordersTotal,
      ordersDone,
      ordersCancelled,
      revenueTotalAgg,
      revenueInRangeAgg,
      campaigns,
      orderCampaignRows,
      recentOrders,
      topProductRows
    ] = await Promise.all([
      this.prisma.product.count({ where: { merchantId } }),
      this.prisma.product.count({ where: { merchantId, deletedAt: null } }),
      this.prisma.reservation.count({
        where: { campaignProduct: { campaign: { merchantId } } }
      }),
      this.prisma.order.count({ where: { merchantId } }),
      this.prisma.order.count({
        where: { merchantId, status: OrderStatus.DONE }
      }),
      this.prisma.order.count({
        where: { merchantId, status: OrderStatus.CANCELLED }
      }),
      this.prisma.order.aggregate({
        where: { merchantId, status: { not: OrderStatus.CANCELLED } },
        _sum: { totalAmount: true }
      }),
      this.prisma.order.aggregate({
        where: {
          merchantId,
          status: { not: OrderStatus.CANCELLED },
          createdAt: { gte: since }
        },
        _sum: { totalAmount: true }
      }),
      this.prisma.campaign.findMany({
        where: { merchantId },
        include: {
          campaignProducts: {
            select: { saleQuantity: true, remainingQuantity: true }
          },
          _count: { select: { campaignProducts: true, preRegistrations: true } }
        },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.order.findMany({
        where: { merchantId },
        select: {
          status: true,
          totalAmount: true,
          reservation: {
            select: {
              campaignProduct: { select: { campaignId: true } }
            }
          }
        }
      }),
      this.prisma.order.findMany({
        where: { merchantId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          status: true,
          totalAmount: true,
          shippingAddress: true,
          createdAt: true,
          customer: {
            select: { id: true, fullName: true, email: true }
          },
          payment: {
            select: { status: true, method: true, paidAt: true }
          },
          reservation: {
            select: {
              campaignProduct: {
                select: {
                  campaign: {
                    select: { id: true, name: true, status: true }
                  }
                }
              }
            }
          }
        }
      }),
      this.prisma.orderItem.findMany({
        where: {
          order: { merchantId, status: { not: OrderStatus.CANCELLED } }
        },
        select: {
          productId: true,
          quantity: true,
          unitPrice: true,
          product: { select: { name: true } }
        }
      })
    ])

    const campaignOrderMap = new Map<
      string,
      { orders: number; revenue: number }
    >()
    for (const row of orderCampaignRows) {
      const campaignId = row.reservation?.campaignProduct?.campaignId
      if (!campaignId) continue

      const existing = campaignOrderMap.get(campaignId) ?? {
        orders: 0,
        revenue: 0
      }
      existing.orders += 1
      if (row.status !== OrderStatus.CANCELLED) {
        existing.revenue += Number(row.totalAmount)
      }
      campaignOrderMap.set(campaignId, existing)
    }

    const campaignsByStatus: Record<CampaignStatus, number> = {
      [CampaignStatus.DRAFT]: 0,
      [CampaignStatus.APPROVED]: 0,
      [CampaignStatus.SCHEDULED]: 0,
      [CampaignStatus.ACTIVE]: 0,
      [CampaignStatus.ENDED]: 0
    }

    for (const campaign of campaigns) {
      campaignsByStatus[campaign.status] += 1
    }

    const campaignsDetailed = campaigns.map(campaign => {
      const ordersSummary = campaignOrderMap.get(campaign.id)
      const totalSaleQuantity = campaign.campaignProducts.reduce(
        (sum, item) => sum + item.saleQuantity,
        0
      )
      const totalRemainingQuantity = campaign.campaignProducts.reduce(
        (sum, item) => sum + item.remainingQuantity,
        0
      )

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        startTime: campaign.startTime,
        endTime: campaign.endTime,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
        deletedAt: campaign.deletedAt,
        merchantHiddenAt: campaign.merchantHiddenAt,
        productsCount: campaign._count.campaignProducts,
        preRegistrationsCount: campaign._count.preRegistrations,
        totalSaleQuantity,
        totalRemainingQuantity,
        ordersCount: ordersSummary?.orders ?? 0,
        revenue: ordersSummary?.revenue ?? 0
      }
    })

    const topProductMap = new Map<
      string,
      { productName: string; quantity: number; revenue: number }
    >()
    for (const item of topProductRows) {
      const existing = topProductMap.get(item.productId)
      const revenue = Number(item.unitPrice) * item.quantity

      if (existing) {
        existing.quantity += item.quantity
        existing.revenue += revenue
      } else {
        topProductMap.set(item.productId, {
          productName: item.product.name,
          quantity: item.quantity,
          revenue
        })
      }
    }

    const topProducts = Array.from(topProductMap.entries())
      .map(([productId, value]) => ({ productId, ...value }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    const revenueTotal = Number(revenueTotalAgg._sum.totalAmount ?? 0)
    const revenueInRange = Number(revenueInRangeAgg._sum.totalAmount ?? 0)
    const averageOrderValue =
      ordersDone > 0 ? Math.round(revenueTotal / ordersDone) : 0
    const conversionRatePct =
      reservationsTotal > 0
        ? Math.round((ordersDone / reservationsTotal) * 10000) / 100
        : 0

    return {
      profile: {
        id: merchant.id,
        userId: merchant.userId,
        businessName: merchant.businessName,
        taxCode: merchant.taxCode,
        description: merchant.description,
        businessPhone: merchant.phone,
        businessAddress: merchant.address,
        businessEmail: merchant.user.email,
        kycStatus: merchant.kycStatus,
        rejectionReason: merchant.rejectionReason,
        approvedAt: merchant.approvedAt,
        approvedBy: merchant.approvedBy,
        createdAt: merchant.createdAt,
        updatedAt: merchant.updatedAt,
        user: merchant.user
      },
      metrics: {
        productsTotal,
        activeProducts,
        campaignsTotal: campaigns.length,
        campaignsByStatus,
        campaignsDeleted: campaigns.filter(c => c.deletedAt !== null).length,
        campaignsHiddenByMerchant: campaigns.filter(
          c => c.merchantHiddenAt !== null
        ).length,
        ordersTotal,
        ordersDone,
        ordersCancelled,
        reservationsTotal,
        conversionRatePct,
        revenueTotal,
        revenueInRange,
        averageOrderValue
      },
      campaigns: campaignsDetailed,
      recentOrders: recentOrders.map(order => ({
        id: order.id,
        status: order.status,
        totalAmount: Number(order.totalAmount),
        shippingAddress: order.shippingAddress,
        createdAt: order.createdAt,
        customer: order.customer,
        payment: order.payment,
        campaign: order.reservation?.campaignProduct?.campaign
      })),
      topProducts,
      timeframe: {
        days,
        since,
        until: now
      }
    }
  }

  // ─── Campaigns ──────────────────────────────────────────────────────

  async findCampaigns(status?: CampaignStatus) {
    return this.prisma.campaign.findMany({
      where: {
        deletedAt: null,
        ...(status ? { status } : {})
      },
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

  async softDeleteCampaign(id: string): Promise<void> {
    await this.prisma.campaign.update({
      where: { id },
      data: { deletedAt: new Date() }
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

  // ─── Orders ──────────────────────────────────────────────────────────

  async findOrders(filters: {
    status?: string
    search?: string
    page: number
    limit: number
  }) {
    const where = {
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.search
        ? {
            OR: [
              {
                id: { contains: filters.search, mode: 'insensitive' as const }
              },
              {
                customer: {
                  fullName: {
                    contains: filters.search,
                    mode: 'insensitive' as const
                  }
                }
              },
              {
                customer: {
                  email: {
                    contains: filters.search,
                    mode: 'insensitive' as const
                  }
                }
              }
            ]
          }
        : {})
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        select: {
          id: true,
          status: true,
          totalAmount: true,
          shippingAddress: true,
          createdAt: true,
          customer: { select: { id: true, fullName: true, email: true } },
          merchant: { select: { id: true, businessName: true } },
          _count: { select: { items: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit
      }),
      this.prisma.order.count({ where })
    ])
    return { items, total }
  }

  // ─── Products ────────────────────────────────────────────────────────

  async findProducts(filters: {
    search?: string
    merchantId?: string
    page: number
    limit: number
  }) {
    const where = {
      ...(filters.merchantId ? { merchantId: filters.merchantId } : {}),
      ...(filters.search
        ? {
            OR: [
              {
                name: { contains: filters.search, mode: 'insensitive' as const }
              },
              {
                merchant: {
                  businessName: {
                    contains: filters.search,
                    mode: 'insensitive' as const
                  }
                }
              }
            ]
          }
        : {})
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          originalPrice: true,
          category: true,
          status: true,
          createdAt: true,
          images: {
            select: { id: true, isPrimary: true },
            take: 1,
            orderBy: { isPrimary: 'desc' }
          },
          merchant: { select: { id: true, businessName: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit
      }),
      this.prisma.product.count({ where })
    ])
    return { items, total }
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
      this.prisma.campaign.count({
        where: { status: CampaignStatus.ACTIVE, deletedAt: null }
      }),
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

  async findUserActionLogs(params?: {
    from?: Date
    to?: Date
    limit?: number
  }) {
    return this.prisma.userActionLog.findMany({
      where:
        params?.from || params?.to
          ? {
              createdAt: {
                ...(params.from ? { gte: params.from } : {}),
                ...(params.to ? { lte: params.to } : {})
              }
            }
          : undefined,
      orderBy: { createdAt: 'desc' },
      take: params?.limit ?? 200
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
        ? orders.reduce((acc, item) => acc + Number(item.commissionRate), 0) /
          orders.length
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

  async getCampaignMonitorOverview(params: {
    campaignId?: string
    since: Date
  }) {
    const since = params.since
    const campaignFilter = params.campaignId
      ? { campaignProduct: { campaignId: params.campaignId } }
      : {}
    const paymentCampaignFilter = params.campaignId
      ? { reservation: { campaignProduct: { campaignId: params.campaignId } } }
      : {}

    const [actionLogs, reservations, successfulPayments, failedJobs] =
      await Promise.all([
        this.prisma.userActionLog.findMany({
          where: {
            createdAt: { gte: since },
            ...(params.campaignId ? { targetId: params.campaignId } : {})
          },
          select: { userId: true, ip: true, action: true, createdAt: true }
        }),
        this.prisma.reservation.findMany({
          where: { createdAt: { gte: since }, ...campaignFilter },
          select: { customerId: true, createdAt: true }
        }),
        this.prisma.payment.findMany({
          where: {
            status: PaymentStatus.SUCCESS,
            paidAt: { gte: since },
            ...paymentCampaignFilter
          },
          select: { createdAt: true, paidAt: true }
        }),
        this.prisma.deadLetterJob.count({
          where: { failedAt: { gte: since } }
        })
      ])

    const visits = actionLogs.length
    const uniqueVisitors = new Set(
      actionLogs.map(log => log.userId ?? log.ip).filter(Boolean)
    ).size
    const reservationCount = reservations.length
    const paymentCount = successfulPayments.length
    const reservationToPaymentRatePct =
      reservationCount > 0 ? (paymentCount / reservationCount) * 100 : 0

    const checkoutLatencies = successfulPayments
      .map(p => {
        if (!p.paidAt) return null
        return (p.paidAt.getTime() - p.createdAt.getTime()) / 1000
      })
      .filter((v): v is number => v !== null && v >= 0)
    const avgCheckoutLatencySeconds =
      checkoutLatencies.length > 0
        ? checkoutLatencies.reduce((acc, v) => acc + v, 0) /
          checkoutLatencies.length
        : 0

    const secondBuckets = new Map<number, number>()
    for (const log of actionLogs) {
      const sec = Math.floor(log.createdAt.getTime() / 1000)
      secondBuckets.set(sec, (secondBuckets.get(sec) ?? 0) + 1)
    }
    const peakActionsPerSecond =
      secondBuckets.size > 0
        ? Math.max(...Array.from(secondBuckets.values()))
        : 0

    const minuteBuckets = new Map<number, number>()
    for (const log of actionLogs) {
      const minute = Math.floor(log.createdAt.getTime() / 60000)
      minuteBuckets.set(minute, (minuteBuckets.get(minute) ?? 0) + 1)
    }
    const minuteValues = Array.from(minuteBuckets.values())
    const mean =
      minuteValues.length > 0
        ? minuteValues.reduce((a, b) => a + b, 0) / minuteValues.length
        : 0
    const variance =
      minuteValues.length > 1
        ? minuteValues.reduce((a, v) => a + (v - mean) ** 2, 0) /
          minuteValues.length
        : 0
    const volatilityIndex = Math.sqrt(variance)

    return {
      visits,
      uniqueVisitors,
      reservations: reservationCount,
      successfulPayments: paymentCount,
      reservationToPaymentRatePct,
      avgCheckoutLatencySeconds,
      peakActionsPerSecond,
      volatilityIndex,
      queueDepth: failedJobs,
      failedJobsLastHour: failedJobs
    }
  }

  async getCampaignMonitorTimeline(params: {
    campaignId?: string
    since: Date
    bucketMinutes: number
  }) {
    const bucketMs = params.bucketMinutes * 60 * 1000
    const campaignFilter = params.campaignId
      ? { campaignProduct: { campaignId: params.campaignId } }
      : {}
    const paymentCampaignFilter = params.campaignId
      ? { reservation: { campaignProduct: { campaignId: params.campaignId } } }
      : {}

    const [actions, reservations, payments] = await Promise.all([
      this.prisma.userActionLog.findMany({
        where: {
          createdAt: { gte: params.since },
          ...(params.campaignId ? { targetId: params.campaignId } : {})
        },
        select: { createdAt: true }
      }),
      this.prisma.reservation.findMany({
        where: { createdAt: { gte: params.since }, ...campaignFilter },
        select: { createdAt: true }
      }),
      this.prisma.payment.findMany({
        where: {
          status: PaymentStatus.SUCCESS,
          paidAt: { gte: params.since },
          ...paymentCampaignFilter
        },
        select: { paidAt: true }
      })
    ])

    const rows = new Map<
      number,
      {
        bucket: string
        visits: number
        reservations: number
        successfulPayments: number
        successRatePct: number
      }
    >()

    const getBucketTs = (date: Date) =>
      Math.floor(date.getTime() / bucketMs) * bucketMs

    const ensure = (ts: number) => {
      const existing = rows.get(ts)
      if (existing) return existing
      const created = {
        bucket: new Date(ts).toISOString(),
        visits: 0,
        reservations: 0,
        successfulPayments: 0,
        successRatePct: 0
      }
      rows.set(ts, created)
      return created
    }

    for (const item of actions) {
      ensure(getBucketTs(item.createdAt)).visits += 1
    }
    for (const item of reservations) {
      ensure(getBucketTs(item.createdAt)).reservations += 1
    }
    for (const item of payments) {
      if (item.paidAt) ensure(getBucketTs(item.paidAt)).successfulPayments += 1
    }

    return Array.from(rows.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, row]) => ({
        ...row,
        successRatePct:
          row.reservations > 0
            ? Math.round((row.successfulPayments / row.reservations) * 10000) /
              100
            : 0
      }))
  }

  // ─── User Detail ────────────────────────────────────────────────────────────

  async getUserDetail(userId: string) {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

    const [
      user,
      recentOrders,
      orderStatusCounts,
      allOrdersAgg,
      completedOrdersAgg,
      orders30d,
      orders90d,
      preRegistrations
    ] = await Promise.all([
      // 1. User với tất cả relations cần thiết
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          status: true,
          emailVerified: true,
          lastLoginAt: true,
          createdAt: true,
          photo: { select: { url: true } },
          customerProfile: {
            select: { phone: true, defaultAddress: true }
          },
          notificationPreference: {
            select: {
              notificationsEnabled: true,
              telegramEnabled: true,
              campaignReminderEnabled: true,
              orderStatusEnabled: true
            }
          },
          telegramLink: {
            select: {
              telegramUsername: true,
              telegramFirstName: true,
              linkedAt: true,
              revokedAt: true
            }
          },
          _count: {
            select: { notifications: { where: { read: false } } }
          }
        }
      }),

      // 2. 20 đơn hàng gần nhất kèm thông tin campaign và merchant
      this.prisma.order.findMany({
        where: { customerId: userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          status: true,
          totalAmount: true,
          shippingAddress: true,
          createdAt: true,
          merchant: { select: { businessName: true } },
          payment: { select: { status: true } },
          reservation: {
            select: {
              campaignProduct: {
                select: {
                  campaign: {
                    select: { id: true, name: true, status: true }
                  }
                }
              }
            }
          },
          _count: { select: { items: true } }
        }
      }),

      // 3. Phân bổ số đơn theo trạng thái
      this.prisma.order.groupBy({
        by: ['status'],
        where: { customerId: userId, deletedAt: null },
        _count: { id: true }
      }),

      // 4. Tổng hợp tất cả đơn (không lọc trạng thái) — lấy ngày đầu/cuối
      this.prisma.order.aggregate({
        where: { customerId: userId, deletedAt: null },
        _count: { id: true },
        _min: { createdAt: true },
        _max: { createdAt: true }
      }),

      // 5. Tổng hợp đơn hoàn thành — tính tổng chi tiêu thực tế
      this.prisma.order.aggregate({
        where: {
          customerId: userId,
          status: OrderStatus.DONE,
          deletedAt: null
        },
        _sum: { totalAmount: true },
        _avg: { totalAmount: true },
        _count: { id: true }
      }),

      // 6. Đơn trong 30 ngày qua
      this.prisma.order.count({
        where: {
          customerId: userId,
          deletedAt: null,
          createdAt: { gte: thirtyDaysAgo }
        }
      }),

      // 7. Đơn trong 90 ngày qua
      this.prisma.order.count({
        where: {
          customerId: userId,
          deletedAt: null,
          createdAt: { gte: ninetyDaysAgo }
        }
      }),

      // 8. Các campaign đã đăng ký trước (pre-registration)
      this.prisma.preRegistration.findMany({
        where: { customerId: userId },
        orderBy: { registeredAt: 'desc' },
        take: 10,
        select: {
          id: true,
          registeredAt: true,
          campaign: {
            select: {
              id: true,
              name: true,
              status: true,
              startTime: true,
              endTime: true
            }
          }
        }
      })
    ])

    return {
      user,
      recentOrders,
      orderStatusCounts,
      allOrdersAgg,
      completedOrdersAgg,
      orders30d,
      orders90d,
      preRegistrations
    }
  }
}
