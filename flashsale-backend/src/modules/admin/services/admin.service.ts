import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common'
import {
  CampaignStatus,
  KycStatus,
  NotificationType,
  PaymentStatus,
  RescheduleRequestStatus,
  RescheduleRequestType,
  UserRole,
  UserStatus
} from '@prisma/client'
import { RedisService } from '@infrastructure/redis/redis.service'
import { RabbitMQService } from '@infrastructure/rabbitmq/rabbitmq.service'
import { CampaignRepository } from '@modules/campaign/repositories/campaign.repository'
import { RescheduleRequestRepository } from '@modules/campaign/repositories/reschedule-request.repository'
import { NotificationService } from '@modules/notification/services/notification.service'
import { EmailService } from '@common/providers/email.service'
import { AdminRepository } from '../repositories/admin.repository'
import {
  CampaignMonitorQueryDto,
  CampaignMonitorTimelineQueryDto,
  ForceRescheduleDto,
  RescheduleRequestQueryDto
} from '../dto/admin.dto'
import { PaymentGatewayConfigService } from '@modules/payment/services/payment-gateway-config.service'
import { ReservationService } from '@modules/reservation/services/reservation.service'
import { PaymentMethod } from '@prisma/client'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name)

  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly redis: RedisService,
    private readonly rabbitmq: RabbitMQService,
    private readonly configService: ConfigService,
    private readonly campaignRepository: CampaignRepository,
    private readonly rescheduleRequestRepository: RescheduleRequestRepository,
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
    private readonly paymentGatewayConfigService: PaymentGatewayConfigService,
    private readonly reservationService: ReservationService
  ) {}

  // ─── Merchants ──────────────────────────────────────────────────────

  async getMerchants(status?: KycStatus) {
    return this.adminRepository.findMerchants(status)
  }

  async approveMerchant(merchantId: string) {
    const profile = await this.adminRepository.findMerchantById(merchantId)
    if (!profile) throw new NotFoundException('Nhà bán hàng không tồn tại')
    await this.adminRepository.approveMerchant(merchantId, profile.userId)
    return { success: true }
  }

  async rejectMerchant(merchantId: string, reason: string) {
    const profile = await this.adminRepository.findMerchantById(merchantId)
    if (!profile) throw new NotFoundException('Nhà bán hàng không tồn tại')
    return this.adminRepository.rejectMerchant(merchantId, reason)
  }

  async getMerchantOverview(merchantId: string, days?: number) {
    const safeDays = days && days > 0 ? Math.min(days, 365) : 30
    const overview = await this.adminRepository.getMerchantOverview(
      merchantId,
      safeDays
    )
    if (!overview) throw new NotFoundException('Nhà bán hàng không tồn tại')
    return overview
  }

  // ─── Campaigns ──────────────────────────────────────────────────────

  async getCampaigns(status?: CampaignStatus) {
    return this.adminRepository.findCampaigns(status)
  }

  async approveCampaign(campaignId: string) {
    return this.adminRepository.updateCampaignStatus(
      campaignId,
      CampaignStatus.SCHEDULED
    )
  }

  async forceStartCampaign(campaignId: string): Promise<{ started: boolean }> {
    const campaign = await this.campaignRepository.findByIdForActivation(
      campaignId
    )
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại')
    if (campaign.status !== CampaignStatus.SCHEDULED)
      throw new BadRequestException(
        'Chỉ có thể force start chiến dịch ở trạng thái SCHEDULED'
      )

    for (const cp of campaign.campaignProducts) {
      await this.redis.initStock(cp.id, cp.saleQuantity)
    }

    if (campaign.preRegistrations.length > 0) {
      await this.redis.loadWhitelist(
        campaign.id,
        campaign.preRegistrations.map(r => r.customerId)
      )
    }

    await this.adminRepository.updateCampaignStatus(
      campaignId,
      CampaignStatus.ACTIVE
    )
    this.logger.log(
      `Campaign force-started by admin: ${campaign.id} (${campaign.name})`
    )

    await Promise.allSettled(
      campaign.preRegistrations.map(async ({ customerId }) => {
        try {
          await this.notificationService.createNotification(customerId, {
            type: NotificationType.CAMPAIGN_STARTING,
            title: 'Flash Sale đang bắt đầu ngay!',
            message: `"${campaign.name}" đã được bắt đầu sớm. Tham gia ngay!`
          })
        } catch (err: unknown) {
          this.logger.warn(
            `Không thể gửi notification cho user ${customerId}: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
        }
      })
    )

    return { started: true }
  }

  async forceStopCampaign(campaignId: string): Promise<{ stopped: boolean }> {
    const campaign = await this.campaignRepository.findByIdForActivation(
      campaignId
    )
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại')
    if (campaign.status !== CampaignStatus.ACTIVE)
      throw new BadRequestException(
        'Chỉ có thể force stop chiến dịch ở trạng thái ACTIVE'
      )

    for (const cp of campaign.campaignProducts) {
      const remaining = await this.redis.getStock(cp.id)
      if (remaining !== null) {
        await this.campaignRepository.updateCampaignProductRemaining(
          cp.id,
          remaining
        )
      }
    }

    // release toàn bộ HOLDING reservations trước khi đóng campaign
    // Tránh trường hợp user có reservation HOLDING tiếp tục thanh toán sau khi stop
    const campaignProductIds = campaign.campaignProducts.map(cp => cp.id)
    await this.reservationService.releaseAllHoldingForCampaign(
      campaignProductIds
    )

    await this.adminRepository.updateCampaignStatus(
      campaignId,
      CampaignStatus.ENDED
    )
    this.logger.log(
      `Campaign force-stopped by admin: ${campaign.id} (${campaign.name})`
    )

    return { stopped: true }
  }

  async deleteExpiredCampaign(
    campaignId: string
  ): Promise<{ deleted: boolean }> {
    const campaign = await this.campaignRepository.findById(campaignId)
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại')
    if (campaign.status !== CampaignStatus.ENDED)
      throw new BadRequestException(
        'Chỉ có thể xóa chiến dịch đã kết thúc (ENDED)'
      )

    await this.adminRepository.softDeleteCampaign(campaignId)
    this.logger.log(
      `Campaign soft-deleted by admin: ${campaign.id} (${campaign.name})`
    )

    return { deleted: true }
  }

  async rejectCampaign(campaignId: string) {
    // Revert to DRAFT so merchant can revise
    return this.adminRepository.updateCampaignStatus(
      campaignId,
      CampaignStatus.DRAFT
    )
  }

  // ─── Users ──────────────────────────────────────────────────────────

  async getUsers(query: {
    role?: UserRole
    search?: string
    page?: number
    limit?: number
  }) {
    return this.adminRepository.findUsers({
      role: query.role,
      search: query.search,
      page: query.page ?? 1,
      limit: query.limit ?? 20
    })
  }

  async suspendUser(userId: string) {
    return this.adminRepository.updateUserStatus(userId, UserStatus.BANNED)
  }

  async activateUser(userId: string) {
    return this.adminRepository.updateUserStatus(userId, UserStatus.ACTIVE)
  }

  async getUserDetail(userId: string) {
    const raw = await this.adminRepository.getUserDetail(userId)

    if (!raw.user) throw new NotFoundException('Người dùng không tồn tại')

    const {
      user,
      recentOrders,
      orderStatusCounts,
      allOrdersAgg,
      completedOrdersAgg,
      orders30d,
      orders90d,
      preRegistrations
    } = raw

    // Map order status counts to lookup object
    const statusMap: Record<string, number> = {}
    for (const s of orderStatusCounts) {
      statusMap[s.status] = s._count.id
    }

    // Derive top campaigns from recent orders (group in application layer)
    const campaignMap = new Map<
      string,
      {
        campaignName: string
        merchantName: string
        orderCount: number
        totalSpend: number
      }
    >()
    for (const order of recentOrders) {
      const campaign = order.reservation?.campaignProduct?.campaign
      if (!campaign) continue
      const existing = campaignMap.get(campaign.id)
      if (existing) {
        existing.orderCount++
        existing.totalSpend += Number(order.totalAmount)
      } else {
        campaignMap.set(campaign.id, {
          campaignName: campaign.name,
          merchantName: order.merchant.businessName,
          orderCount: 1,
          totalSpend: Number(order.totalAmount)
        })
      }
    }

    const totalSpend = Number(completedOrdersAgg._sum.totalAmount ?? 0)
    const completedOrders = completedOrdersAgg._count.id
    const avgOrderValue =
      completedOrders > 0 ? Math.round(totalSpend / completedOrders) : 0

    const telegramActive =
      !!user.telegramLink && user.telegramLink.revokedAt === null

    return {
      // Identity
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified ?? false,
      avatarUrl: user.photo?.url ?? null,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),

      // Profile
      phone: user.customerProfile?.phone ?? null,
      defaultAddress: user.customerProfile?.defaultAddress ?? null,

      // Telegram
      telegramLinked: telegramActive,
      telegramUsername: telegramActive
        ? user.telegramLink?.telegramUsername ?? null
        : null,
      telegramLinkedAt: telegramActive
        ? user.telegramLink?.linkedAt?.toISOString() ?? null
        : null,

      // Notification preferences
      notificationsEnabled:
        user.notificationPreference?.notificationsEnabled ?? true,
      telegramEnabled: user.notificationPreference?.telegramEnabled ?? false,
      campaignReminderEnabled:
        user.notificationPreference?.campaignReminderEnabled ?? true,
      orderStatusEnabled:
        user.notificationPreference?.orderStatusEnabled ?? true,

      // Purchase stats
      totalOrders: allOrdersAgg._count.id,
      completedOrders,
      cancelledOrders: statusMap['CANCELLED'] ?? 0,
      totalSpend,
      avgOrderValue,
      firstOrderAt: allOrdersAgg._min.createdAt?.toISOString() ?? null,
      lastOrderAt: allOrdersAgg._max.createdAt?.toISOString() ?? null,
      purchasesLast30Days: orders30d,
      purchasesLast90Days: orders90d,
      unreadNotifications: user._count.notifications,

      // Order breakdown by status
      ordersPending: statusMap['PENDING'] ?? 0,
      ordersConfirmed: statusMap['CONFIRMED'] ?? 0,
      ordersShipping: statusMap['SHIPPING'] ?? 0,
      ordersDone: statusMap['DONE'] ?? 0,
      ordersCancelled: statusMap['CANCELLED'] ?? 0,

      // Recent orders
      recentOrders: recentOrders.map(o => ({
        id: o.id,
        status: o.status,
        totalAmount: Number(o.totalAmount),
        shippingAddress: o.shippingAddress,
        createdAt: o.createdAt.toISOString(),
        campaignId: o.reservation?.campaignProduct?.campaign?.id ?? null,
        campaignName: o.reservation?.campaignProduct?.campaign?.name ?? null,
        campaignStatus:
          o.reservation?.campaignProduct?.campaign?.status ?? null,
        itemCount: o._count.items,
        paymentStatus: o.payment?.status ?? null,
        merchantName: o.merchant.businessName
      })),

      // Pre-registrations
      preRegistrations: preRegistrations.map(p => ({
        id: p.id,
        createdAt: p.registeredAt.toISOString(),
        campaignId: p.campaign.id,
        campaignName: p.campaign.name,
        campaignStatus: p.campaign.status,
        campaignStartTime: p.campaign.startTime.toISOString(),
        campaignEndTime: p.campaign.endTime.toISOString()
      })),

      // Top campaigns sorted by order count
      topCampaigns: Array.from(campaignMap.entries())
        .map(([id, data]) => ({ campaignId: id, ...data }))
        .sort((a, b) => b.orderCount - a.orderCount)
        .slice(0, 5)
    }
  }

  // ─── Orders ─────────────────────────────────────────────────────────

  async getOrders(filters: {
    page: number
    limit: number
    status?: string
    search?: string
  }) {
    return this.adminRepository.findOrders(filters)
  }

  // ─── Products ────────────────────────────────────────────────────────

  async getProducts(filters: {
    page: number
    limit: number
    search?: string
    merchantId?: string
  }) {
    return this.adminRepository.findProducts(filters)
  }

  // ─── Statistics ─────────────────────────────────────────────────────

  async getStats() {
    return this.adminRepository.getStats()
  }

  async getOrdersByTime(start: Date, end: Date) {
    const rows = await this.adminRepository.getOrdersByTime(start, end)
    return rows.map(r => ({ bucket: r.bucket, orders: Number(r.count) }))
  }

  async getRevenueTrend(days = 7) {
    const rows = await this.adminRepository.getRevenueTrend(days)
    return rows.map(({ dayStart, revenue }) => ({
      date: dayStart.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit'
      }),
      revenue
    }))
  }

  async getActivity() {
    const { recentOrders, recentApprovals } =
      await this.adminRepository.getActivity()

    return [
      ...recentOrders.map(o => ({
        type: 'ORDER',
        message: `Đơn hàng mới từ ${o.customer?.fullName ?? 'Khách hàng'}`,
        createdAt: o.createdAt
      })),
      ...recentApprovals.map(m => ({
        type: 'MERCHANT_APPROVED',
        message: `Merchant ${m.businessName} đã được duyệt`,
        createdAt: m.updatedAt
      }))
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)
  }

  // ─── Dead Letter Queue ───────────────────────────────────────────────

  async getDeadLetterJobs() {
    return this.adminRepository.findDeadLetterJobs()
  }

  async retryJob(jobId: string) {
    const job = await this.adminRepository.findDeadLetterJobById(jobId)
    if (!job) throw new NotFoundException('Tác vụ không tồn tại')

    const queue =
      job.type === 'ORDER_PROCESSING' ? 'order.high' : 'notification'
    await this.rabbitmq.publish(queue, job.payload as object)
    await this.adminRepository.incrementJobRetryCount(jobId)
    return { retried: true }
  }

  async discardJob(jobId: string) {
    const job = await this.adminRepository.findDeadLetterJobById(jobId)
    if (!job) throw new NotFoundException('Tác vụ không tồn tại')
    await this.adminRepository.deleteDeadLetterJob(jobId)
    return { discarded: true }
  }

  // ─── System Health ───────────────────────────────────────────────────

  async getSystemHealth() {
    const [postgres, redisOk, rabbitmqOk] = await Promise.all([
      this.adminRepository['prisma'].$queryRaw`SELECT 1`
        .then(() => 'UP')
        .catch(() => 'DOWN'),
      this.redis.client
        .ping()
        .then(() => 'UP')
        .catch(() => 'DOWN'),
      this.rabbitmq.getChannel()
        ? Promise.resolve('UP')
        : Promise.resolve('DOWN')
    ])
    return { postgres, redis: redisOk, rabbitmq: rabbitmqOk, api: 'UP' }
  }

  async getQueueStats() {
    const [high, normal] = await Promise.all([
      this.rabbitmq.getQueueStats('order.high'),
      this.rabbitmq.getQueueStats('order.normal')
    ])
    return { high: high.messageCount, normal: normal.messageCount }
  }

  async getSystemLogs() {
    const logs = await this.redis.client.lrange('system:logs', 0, 49)
    return logs.map(l => JSON.parse(l) as object)
  }

  // ─── Payments ────────────────────────────────────────────────────────

  async getAdminPayments(status?: PaymentStatus) {
    return this.adminRepository.findPayments(status)
  }

  // ─── Customer Profiles ───────────────────────────────────────────────

  async getCustomerProfiles() {
    return this.adminRepository.findCustomerProfiles()
  }

  // ─── Notifications ───────────────────────────────────────────────────

  async getAdminNotifications() {
    return this.adminRepository.findNotifications()
  }

  // ─── Stock Audit Logs ────────────────────────────────────────────────

  async getStockAuditLogs() {
    return this.adminRepository.findStockAuditLogs()
  }

  // ─── User Action Logs ────────────────────────────────────────────────

  async getUserActionLogs(params: {
    page: number
    limit: number
    action?: string
    userId?: string
    ip?: string
    from?: string
    to?: string
  }) {
    return this.adminRepository.findUserActionLogs({
      page: params.page,
      limit: params.limit,
      action: params.action,
      userId: params.userId,
      ip: params.ip,
      from: params.from ? new Date(params.from) : undefined,
      to: params.to ? new Date(params.to) : undefined
    })
  }

  // ─── Outbox Events ───────────────────────────────────────────────────

  async getOutboxEvents() {
    return this.adminRepository.findOutboxEvents()
  }

  // ─── Finance / Commission ─────────────────────────────────────────────

  async getFinanceSummary() {
    return this.adminRepository.getFinanceSummary()
  }

  async getFinanceTrend(days = 7) {
    const rows = await this.adminRepository.getFinanceTrend(days)
    return rows.map(({ dayStart, commissionRevenue, grossRevenue }) => ({
      date: dayStart.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit'
      }),
      commissionRevenue,
      grossRevenue
    }))
  }

  async getFinanceCategoryBreakdown() {
    return this.adminRepository.getFinanceCategoryBreakdown()
  }

  async getPaymentGatewayConfigs() {
    return this.paymentGatewayConfigService.listAll()
  }

  async updatePaymentGatewayConfig(
    gateway: PaymentMethod,
    data: {
      enabled?: boolean
      isDefault?: boolean
      displayName?: string
      config?: Record<string, unknown> | null
    }
  ) {
    return this.paymentGatewayConfigService.updateGatewayConfig(gateway, data)
  }

  async getCampaignMonitorOverview(query: CampaignMonitorQueryDto) {
    const minutes = query.minutes ?? 60
    const since = new Date(Date.now() - minutes * 60 * 1000)
    return this.adminRepository.getCampaignMonitorOverview({
      campaignId: query.campaignId,
      since
    })
  }

  async getCampaignMonitorTimeline(query: CampaignMonitorTimelineQueryDto) {
    const minutes = query.minutes ?? 60
    const since = new Date(Date.now() - minutes * 60 * 1000)
    return this.adminRepository.getCampaignMonitorTimeline({
      campaignId: query.campaignId,
      since,
      bucketMinutes: query.bucketMinutes ?? 5
    })
  }

  // ─── Campaign Reschedule ─────────────────────────────────────────────────────

  /** Admin tạo yêu cầu force thay đổi lịch — merchant phải xác nhận */
  async forceReschedule(
    adminUserId: string,
    campaignId: string,
    dto: ForceRescheduleDto
  ): Promise<unknown> {
    const campaign = await this.campaignRepository.findById(campaignId)
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại')
    if (campaign.status !== CampaignStatus.SCHEDULED)
      throw new BadRequestException(
        'Chỉ có thể force reschedule chiến dịch ở trạng thái SCHEDULED'
      )

    const hasPending = await this.rescheduleRequestRepository.hasPendingRequest(
      campaignId
    )
    if (hasPending)
      throw new BadRequestException(
        'Chiến dịch đang có yêu cầu thay đổi lịch chờ xử lý'
      )

    const newStartTime = new Date(Date.now() + dto.offsetMinutes * 60_000)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000) // 24 giờ

    const request = await this.rescheduleRequestRepository.create({
      campaignId,
      requestedBy: adminUserId,
      requestType: RescheduleRequestType.ADMIN_FORCE,
      newStartTime,
      expiresAt,
      note: dto.note
    })

    const details = await this.rescheduleRequestRepository.findByIdWithDetails(
      request.id
    )
    if (!details) return request

    const { merchant } = details.campaign
    const formattedNewStart = this.formatDateTime(newStartTime)
    const formattedExpiry = this.formatDateTime(expiresAt)
    const clientUrl = this.configService.get<string>(
      'application.CLIENT_URL_SERVER',
      ''
    )

    try {
      await this.notificationService.createNotification(merchant.userId, {
        type: NotificationType.RESCHEDULE_CONFIRMATION_NEEDED,
        title: 'Yêu cầu thay đổi lịch bắt đầu chiến dịch',
        message: `Admin đã yêu cầu thay đổi lịch bắt đầu chiến dịch "${details.campaign.name}". Vui lòng xác nhận hoặc từ chối.`
      })
    } catch (err: unknown) {
      this.logger.error(
        `Không thể tạo notification cho merchant ${merchant.userId}: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }

    try {
      await this.emailService.sendCampaignRescheduleRequest({
        to: merchant.user.email,
        merchantName: merchant.user.fullName,
        campaignName: details.campaign.name,
        newStartTime: formattedNewStart,
        expiresAt: formattedExpiry,
        dashboardUrl: `${clientUrl}/merchant/reschedule-requests`
      })
    } catch (err: unknown) {
      this.logger.error(
        `Không thể gửi email cho merchant ${merchant.user.email}: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }

    return request
  }

  /** Admin duyệt yêu cầu thay đổi lịch từ merchant */
  async approveRescheduleRequest(
    adminUserId: string,
    requestId: string
  ): Promise<{ approved: boolean }> {
    const request = await this.rescheduleRequestRepository.findByIdWithDetails(
      requestId
    )
    if (!request)
      throw new NotFoundException('Yêu cầu thay đổi lịch không tồn tại')
    if (request.requestType !== RescheduleRequestType.MERCHANT_REQUEST)
      throw new BadRequestException('Chỉ có thể duyệt yêu cầu từ nhà bán hàng')
    if (request.status !== RescheduleRequestStatus.PENDING_ADMIN)
      throw new BadRequestException('Yêu cầu này không ở trạng thái chờ duyệt')
    if (new Date() > request.expiresAt)
      throw new BadRequestException('Yêu cầu đã hết hạn')

    const oldStartTime = request.campaign.startTime

    await this.campaignRepository.update(request.campaignId, {
      startTime: request.newStartTime
    })

    await this.rescheduleRequestRepository.update(requestId, {
      status: RescheduleRequestStatus.APPLIED,
      resolvedAt: new Date()
    })

    const formattedOld = this.formatDateTime(oldStartTime)
    const formattedNew = this.formatDateTime(request.newStartTime)
    const subscribers = request.campaign.preRegistrations

    await Promise.allSettled(
      subscribers.map(async ({ customer }) => {
        try {
          await this.notificationService.createNotification(customer.id, {
            type: NotificationType.CAMPAIGN_RESCHEDULED,
            title: 'Thời gian bắt đầu chiến dịch đã thay đổi',
            message: `Chiến dịch "${request.campaign.name}" sẽ bắt đầu lúc ${formattedNew} (thay vì ${formattedOld})`
          })
        } catch (err: unknown) {
          this.logger.error(
            `Không thể tạo notification cho user ${customer.id}: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
        }

        try {
          await this.emailService.sendCampaignTimeChanged({
            to: customer.email,
            name: customer.fullName,
            campaignName: request.campaign.name,
            oldStartTime: formattedOld,
            newStartTime: formattedNew
          })
        } catch (err: unknown) {
          this.logger.error(
            `Không thể gửi email cho ${customer.email}: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
        }
      })
    )

    return { approved: true }
  }

  /** Admin từ chối yêu cầu thay đổi lịch từ merchant */
  async rejectRescheduleRequest(
    adminUserId: string,
    requestId: string
  ): Promise<{ rejected: boolean }> {
    const request = await this.rescheduleRequestRepository.findById(requestId)
    if (!request)
      throw new NotFoundException('Yêu cầu thay đổi lịch không tồn tại')
    if (request.requestType !== RescheduleRequestType.MERCHANT_REQUEST)
      throw new BadRequestException(
        'Chỉ có thể từ chối yêu cầu từ nhà bán hàng'
      )
    if (request.status !== RescheduleRequestStatus.PENDING_ADMIN)
      throw new BadRequestException(
        'Yêu cầu này không thể từ chối hoặc đã được xử lý'
      )

    await this.rescheduleRequestRepository.update(requestId, {
      status: RescheduleRequestStatus.REJECTED,
      resolvedAt: new Date()
    })

    return { rejected: true }
  }

  /** Lấy danh sách tất cả yêu cầu thay đổi lịch */
  async getRescheduleRequests(
    query: RescheduleRequestQueryDto
  ): Promise<unknown[]> {
    return this.rescheduleRequestRepository.findAll({
      status: query.status as RescheduleRequestStatus | undefined,
      requestType: query.requestType as RescheduleRequestType | undefined,
      campaignId: query.campaignId
    })
  }

  private formatDateTime(date: Date): string {
    return date.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh'
    })
  }
}
