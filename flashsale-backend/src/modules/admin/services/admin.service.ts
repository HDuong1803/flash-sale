import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import {
  CampaignStatus,
  KycStatus,
  NotificationType,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  RescheduleRequestStatus,
  RescheduleRequestType,
  UserRole,
  UserStatus,
} from '@prisma/client'
import { RedisService } from '@infrastructure/redis/redis.service'
import { RabbitMQService } from '@infrastructure/rabbitmq/rabbitmq.service'
import { CampaignRepository } from '@modules/campaign/repositories/campaign.repository'
import { RescheduleRequestRepository } from '@modules/campaign/repositories/reschedule-request.repository'
import { NotificationService } from '@modules/notification/services/notification.service'
import { EmailService } from '@common/providers/email.service'
import { AdminRepository } from '../repositories/admin.repository'
import { ForceRescheduleDto, RescheduleRequestQueryDto } from '../dto/admin.dto'

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name)

  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly redis: RedisService,
    private readonly rabbitmq: RabbitMQService,
    private readonly campaignRepository: CampaignRepository,
    private readonly rescheduleRequestRepository: RescheduleRequestRepository,
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
  ) {}

  // ─── Merchants ──────────────────────────────────────────────────────

  async getMerchants(status?: KycStatus) {
    return this.adminRepository.findMerchants(status)
  }

  async approveMerchant(merchantId: string) {
    const profile = await this.adminRepository.findMerchantById(merchantId)
    if (!profile) throw new NotFoundException('Merchant không tồn tại')
    await this.adminRepository.approveMerchant(merchantId, profile.userId)
    return { success: true }
  }

  async rejectMerchant(merchantId: string, reason: string) {
    const profile = await this.adminRepository.findMerchantById(merchantId)
    if (!profile) throw new NotFoundException('Merchant không tồn tại')
    return this.adminRepository.rejectMerchant(merchantId, reason)
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

  // ─── Statistics ─────────────────────────────────────────────────────

  async getStats() {
    return this.adminRepository.getStats()
  }

  async getOrdersByTime(start: Date, end: Date) {
    const rows = await this.adminRepository.getOrdersByTime(start, end)
    return rows.map(r => ({ bucket: r.bucket, orders: Number(r.count) }))
  }

  async getRevenueTrend() {
    const rows = await this.adminRepository.getRevenueTrend()
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
    if (!job) throw new NotFoundException('Job không tồn tại')

    const queue =
      job.type === 'ORDER_PROCESSING' ? 'order.high' : 'notification'
    await this.rabbitmq.publish(queue, job.payload as object)
    await this.adminRepository.incrementJobRetryCount(jobId)
    return { retried: true }
  }

  async discardJob(jobId: string) {
    const job = await this.adminRepository.findDeadLetterJobById(jobId)
    if (!job) throw new NotFoundException('Job không tồn tại')
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

  // ─── Orders ─────────────────────────────────────────────────────────

  async getAdminOrders(status?: OrderStatus) {
    return this.adminRepository.findOrders(status)
  }

  // ─── Payments ────────────────────────────────────────────────────────

  async getAdminPayments(status?: PaymentStatus) {
    return this.adminRepository.findPayments(status)
  }

  // ─── Products ────────────────────────────────────────────────────────

  async getAdminProducts(status?: ProductStatus) {
    return this.adminRepository.findProducts(status)
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

  async getUserActionLogs() {
    return this.adminRepository.findUserActionLogs()
  }

  // ─── Outbox Events ───────────────────────────────────────────────────

  async getOutboxEvents() {
    return this.adminRepository.findOutboxEvents()
  }

  // ─── Campaign Reschedule ─────────────────────────────────────────────────────

  /** Admin tạo yêu cầu force thay đổi lịch — merchant phải xác nhận */
  async forceReschedule(
    adminUserId: string,
    campaignId: string,
    dto: ForceRescheduleDto,
  ): Promise<unknown> {
    const campaign = await this.campaignRepository.findById(campaignId)
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại')
    if (campaign.status !== CampaignStatus.SCHEDULED)
      throw new BadRequestException(
        'Chỉ có thể force reschedule chiến dịch ở trạng thái SCHEDULED',
      )

    const hasPending = await this.rescheduleRequestRepository.hasPendingRequest(campaignId)
    if (hasPending)
      throw new BadRequestException('Chiến dịch đang có yêu cầu thay đổi lịch chờ xử lý')

    const newStartTime = new Date(Date.now() + dto.offsetMinutes * 60_000)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000) // 24 giờ

    const request = await this.rescheduleRequestRepository.create({
      campaignId,
      requestedBy: adminUserId,
      requestType: RescheduleRequestType.ADMIN_FORCE,
      newStartTime,
      expiresAt,
      note: dto.note,
    })

    const details = await this.rescheduleRequestRepository.findByIdWithDetails(request.id)
    if (!details) return request

    const { merchant } = details.campaign
    const formattedNewStart = this.formatDateTime(newStartTime)
    const formattedExpiry = this.formatDateTime(expiresAt)
    const frontendUrl = process.env.FRONTEND_URL ?? ''

    try {
      await this.notificationService.createNotification(merchant.userId, {
        type: NotificationType.RESCHEDULE_CONFIRMATION_NEEDED,
        title: 'Yêu cầu thay đổi lịch bắt đầu campaign',
        message: `Admin đã yêu cầu thay đổi lịch bắt đầu campaign "${details.campaign.name}". Vui lòng xác nhận hoặc từ chối.`,
      })
    } catch (err: unknown) {
      this.logger.error(
        `Không thể tạo notification cho merchant ${merchant.userId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    try {
      await this.emailService.sendCampaignRescheduleRequest({
        to: merchant.user.email,
        merchantName: merchant.user.fullName,
        campaignName: details.campaign.name,
        newStartTime: formattedNewStart,
        expiresAt: formattedExpiry,
        dashboardUrl: `${frontendUrl}/merchant/reschedule-requests`,
      })
    } catch (err: unknown) {
      this.logger.error(
        `Không thể gửi email cho merchant ${merchant.user.email}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    return request
  }

  /** Admin duyệt yêu cầu thay đổi lịch từ merchant */
  async approveRescheduleRequest(
    adminUserId: string,
    requestId: string,
  ): Promise<{ approved: boolean }> {
    const request = await this.rescheduleRequestRepository.findByIdWithDetails(requestId)
    if (!request) throw new NotFoundException('Yêu cầu thay đổi lịch không tồn tại')
    if (request.requestType !== RescheduleRequestType.MERCHANT_REQUEST)
      throw new BadRequestException('Chỉ có thể duyệt yêu cầu từ merchant')
    if (request.status !== RescheduleRequestStatus.PENDING_ADMIN)
      throw new BadRequestException('Yêu cầu này không ở trạng thái chờ duyệt')
    if (new Date() > request.expiresAt)
      throw new BadRequestException('Yêu cầu đã hết hạn')

    const oldStartTime = request.campaign.startTime

    await this.campaignRepository.update(request.campaignId, {
      startTime: request.newStartTime,
    })

    await this.rescheduleRequestRepository.update(requestId, {
      status: RescheduleRequestStatus.APPLIED,
      resolvedAt: new Date(),
    })

    const formattedOld = this.formatDateTime(oldStartTime)
    const formattedNew = this.formatDateTime(request.newStartTime)
    const subscribers = request.campaign.preRegistrations

    await Promise.allSettled(
      subscribers.map(async ({ customer }) => {
        try {
          await this.notificationService.createNotification(customer.id, {
            type: NotificationType.CAMPAIGN_RESCHEDULED,
            title: 'Thời gian bắt đầu campaign đã thay đổi',
            message: `Campaign "${request.campaign.name}" sẽ bắt đầu lúc ${formattedNew} (thay vì ${formattedOld})`,
          })
        } catch (err: unknown) {
          this.logger.error(
            `Không thể tạo notification cho user ${customer.id}: ${err instanceof Error ? err.message : String(err)}`,
          )
        }

        try {
          await this.emailService.sendCampaignTimeChanged({
            to: customer.email,
            name: customer.fullName,
            campaignName: request.campaign.name,
            oldStartTime: formattedOld,
            newStartTime: formattedNew,
          })
        } catch (err: unknown) {
          this.logger.error(
            `Không thể gửi email cho ${customer.email}: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }),
    )

    return { approved: true }
  }

  /** Admin từ chối yêu cầu thay đổi lịch từ merchant */
  async rejectRescheduleRequest(
    adminUserId: string,
    requestId: string,
  ): Promise<{ rejected: boolean }> {
    const request = await this.rescheduleRequestRepository.findById(requestId)
    if (!request) throw new NotFoundException('Yêu cầu thay đổi lịch không tồn tại')
    if (request.requestType !== RescheduleRequestType.MERCHANT_REQUEST)
      throw new BadRequestException('Chỉ có thể từ chối yêu cầu từ merchant')
    if (request.status !== RescheduleRequestStatus.PENDING_ADMIN)
      throw new BadRequestException('Yêu cầu này không thể từ chối hoặc đã được xử lý')

    await this.rescheduleRequestRepository.update(requestId, {
      status: RescheduleRequestStatus.REJECTED,
      resolvedAt: new Date(),
    })

    return { rejected: true }
  }

  /** Lấy danh sách tất cả yêu cầu thay đổi lịch */
  async getRescheduleRequests(query: RescheduleRequestQueryDto): Promise<unknown[]> {
    return this.rescheduleRequestRepository.findAll({
      status: query.status as RescheduleRequestStatus | undefined,
      requestType: query.requestType as RescheduleRequestType | undefined,
      campaignId: query.campaignId,
    })
  }

  private formatDateTime(date: Date): string {
    return date.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
    })
  }
}
