import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common'
import {
  CampaignStatus,
  KycStatus,
  NotificationType,
  RescheduleRequestStatus,
  RescheduleRequestType
} from '@prisma/client'
import { MerchantRepository } from '@modules/merchant/repositories/merchant.repository'
import { ProductRepository } from '@modules/product/repositories/product.repository'
import { NotificationService } from '@modules/notification/services/notification.service'
import { EmailService } from '@common/providers/email.service'
import { RedisService } from '@infrastructure/redis/redis.service'
import { CampaignRepository } from '../repositories/campaign.repository'
import { RescheduleRequestRepository } from '../repositories/reschedule-request.repository'
import {
  AddCampaignProductDto,
  CreateCampaignDto,
  CampaignQueryDto,
  RescheduleRequestDto,
  RescheduleRequestResponseDto,
  UpdateCampaignDto
} from '../dto/campaign.dto'

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name)

  constructor(
    private readonly campaignRepository: CampaignRepository,
    private readonly merchantRepository: MerchantRepository,
    private readonly productRepository: ProductRepository,
    private readonly rescheduleRequestRepository: RescheduleRequestRepository,
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
    private readonly redis: RedisService
  ) {}

  private async getApprovedMerchant(userId: string) {
    const merchant = await this.merchantRepository.findByUserId(userId)
    if (!merchant) throw new ForbiddenException('Bạn chưa đăng ký làm merchant')
    if (merchant.kycStatus !== KycStatus.APPROVED)
      throw new ForbiddenException('Merchant chưa được duyệt')
    return merchant
  }

  async create(userId: string, dto: CreateCampaignDto) {
    const merchant = await this.getApprovedMerchant(userId)
    const start = new Date(dto.startTime)
    const end = new Date(dto.endTime)

    if (start <= new Date(Date.now() + 60 * 60 * 1000))
      throw new BadRequestException('Thời gian bắt đầu phải sau ít nhất 1 giờ')
    if (end <= new Date(start.getTime() + 30 * 60 * 1000))
      throw new BadRequestException(
        'Thời gian kết thúc phải sau bắt đầu ít nhất 30 phút'
      )

    return this.campaignRepository.create({
      merchantId: merchant.id,
      name: dto.name,
      description: dto.description,
      startTime: start,
      endTime: end
    })
  }

  async findAll(query: CampaignQueryDto) {
    const publicStatuses: CampaignStatus[] = [
      CampaignStatus.SCHEDULED,
      CampaignStatus.ACTIVE,
      CampaignStatus.ENDED
    ]
    const requestedStatus =
      query.status && publicStatuses.includes(query.status)
        ? query.status
        : undefined
    return this.campaignRepository.findAll({
      statuses: requestedStatus ? [requestedStatus] : publicStatuses,
      search: query.search,
      page: query.page ?? 1,
      limit: query.limit ?? 12
    })
  }

  async findOne(id: string, userId?: string) {
    const campaign = await this.campaignRepository.findByIdWithProducts(
      id,
      userId
    )
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại')

    // Khi campaign ACTIVE, remainingQuantity trong DB có thể là 0 (chưa sync từ Redis).
    // Đọc stock thực từ Redis để trả về giá trị chính xác.
    if (campaign.status === CampaignStatus.ACTIVE) {
      await Promise.allSettled(
        campaign.campaignProducts.map(async cp => {
          const remaining = await this.redis.getStock(cp.id)
          if (remaining !== null) {
            cp.remainingQuantity = remaining
          }
        })
      )
    }

    return campaign
  }

  async update(userId: string, id: string, dto: UpdateCampaignDto) {
    const merchant = await this.getApprovedMerchant(userId)
    const campaign = await this.campaignRepository.findByIdAndMerchant(
      id,
      merchant.id
    )
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại')
    if (campaign.status !== CampaignStatus.DRAFT)
      throw new BadRequestException(
        'Chỉ có thể sửa chiến dịch ở trạng thái DRAFT'
      )

    const data: Partial<{
      name: string
      description: string
      startTime: Date
      endTime: Date
    }> = {}
    if (dto.name) data.name = dto.name
    if (dto.description) data.description = dto.description
    if (dto.startTime) data.startTime = new Date(dto.startTime)
    if (dto.endTime) data.endTime = new Date(dto.endTime)

    return this.campaignRepository.update(id, data)
  }

  async addProduct(
    userId: string,
    campaignId: string,
    dto: AddCampaignProductDto
  ) {
    const merchant = await this.getApprovedMerchant(userId)
    const campaign = await this.campaignRepository.findByIdAndMerchant(
      campaignId,
      merchant.id
    )
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại')
    if (campaign.status !== CampaignStatus.DRAFT)
      throw new BadRequestException(
        'Chỉ thêm sản phẩm khi chiến dịch ở trạng thái DRAFT'
      )

    const product = await this.productRepository.findByIdAndMerchant(
      dto.productId,
      merchant.id
    )
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại')
    if (dto.salePrice >= Number(product.originalPrice))
      throw new BadRequestException('Giá sale phải thấp hơn giá gốc')

    const inventory = await this.productRepository.getInventory(dto.productId)
    if (!inventory || inventory.quantity < dto.saleQuantity)
      throw new BadRequestException('Số lượng sale vượt quá tồn kho')

    return this.campaignRepository.addProduct({
      campaignId,
      productId: dto.productId,
      salePrice: dto.salePrice,
      saleQuantity: dto.saleQuantity,
      perUserLimit: dto.perUserLimit
    })
  }

  async removeProduct(userId: string, campaignId: string, productId: string) {
    const merchant = await this.getApprovedMerchant(userId)
    const campaign = await this.campaignRepository.findByIdAndMerchant(
      campaignId,
      merchant.id
    )
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại')
    if (campaign.status !== CampaignStatus.DRAFT)
      throw new BadRequestException(
        'Chỉ xóa sản phẩm khi chiến dịch ở trạng thái DRAFT'
      )

    await this.campaignRepository.removeProduct(campaignId, productId)
    return { removed: true }
  }

  async delete(userId: string, id: string): Promise<{ deleted: boolean }> {
    const merchant = await this.getApprovedMerchant(userId)
    const campaign = await this.campaignRepository.findByIdAndMerchant(
      id,
      merchant.id
    )
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại')
    if (campaign.status !== CampaignStatus.DRAFT)
      throw new BadRequestException(
        'Chỉ có thể xóa chiến dịch ở trạng thái DRAFT'
      )
    await this.campaignRepository.delete(id)
    return { deleted: true }
  }

  async submit(userId: string, id: string) {
    const merchant = await this.getApprovedMerchant(userId)
    const campaign =
      await this.campaignRepository.findByIdAndMerchantWithProducts(
        id,
        merchant.id
      )
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại')
    if (campaign.status !== CampaignStatus.DRAFT)
      throw new BadRequestException('Chiến dịch không ở trạng thái DRAFT')
    if (campaign.campaignProducts.length === 0)
      throw new BadRequestException(
        'Cần có ít nhất 1 sản phẩm trước khi gửi duyệt'
      )

    return this.campaignRepository.updateStatus(id, CampaignStatus.APPROVED)
  }

  async preRegister(userId: string, campaignId: string) {
    const campaign = await this.campaignRepository.findById(campaignId)
    if (
      !campaign ||
      (campaign.status !== CampaignStatus.APPROVED &&
        campaign.status !== CampaignStatus.SCHEDULED)
    )
      throw new BadRequestException('Chiến dịch không nhận đăng ký trước')

    await this.campaignRepository.upsertPreRegistration(userId, campaignId)
    return { registered: true }
  }

  async cancelPreRegister(userId: string, campaignId: string) {
    const campaign = await this.campaignRepository.findById(campaignId)
    if (
      !campaign ||
      (campaign.status !== CampaignStatus.APPROVED &&
        campaign.status !== CampaignStatus.SCHEDULED)
    )
      throw new BadRequestException('Chiến dịch không hợp lệ để huỷ đăng ký')

    const deleted = await this.campaignRepository.deletePreRegistration(
      userId,
      campaignId
    )
    if (!deleted)
      throw new BadRequestException(
        'Bạn chưa đăng ký nhắc nhở cho chiến dịch này'
      )

    return { registered: false }
  }

  /** Merchant yêu cầu mở campaign sớm hơn (MERCHANT_REQUEST) */
  async createRescheduleRequest(
    userId: string,
    campaignId: string,
    dto: RescheduleRequestDto
  ): Promise<RescheduleRequestResponseDto> {
    const merchant = await this.getApprovedMerchant(userId)

    const campaign = await this.campaignRepository.findByIdAndMerchant(
      campaignId,
      merchant.id
    )
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại')
    if (campaign.status !== CampaignStatus.SCHEDULED)
      throw new BadRequestException(
        'Chỉ có thể yêu cầu thay đổi lịch với chiến dịch ở trạng thái SCHEDULED'
      )

    const hasPending = await this.rescheduleRequestRepository.hasPendingRequest(
      campaignId
    )
    if (hasPending)
      throw new BadRequestException(
        'Chiến dịch đang có yêu cầu thay đổi lịch chờ xử lý'
      )

    const newStartTime = new Date(Date.now() + dto.offsetMinutes * 60_000)
    const expiresAt = new Date(Date.now() + 48 * 60 * 60_000) // 48 giờ

    const request = await this.rescheduleRequestRepository.create({
      campaignId,
      requestedBy: userId,
      requestType: RescheduleRequestType.MERCHANT_REQUEST,
      newStartTime,
      expiresAt,
      note: dto.note
    })

    return request as RescheduleRequestResponseDto
  }

  /** Merchant xác nhận yêu cầu force reschedule của admin */
  async confirmAdminReschedule(
    userId: string,
    requestId: string
  ): Promise<RescheduleRequestResponseDto> {
    const merchant = await this.getApprovedMerchant(userId)

    const request = await this.rescheduleRequestRepository.findByIdWithDetails(
      requestId
    )
    if (!request)
      throw new NotFoundException('Yêu cầu thay đổi lịch không tồn tại')
    if (request.requestType !== RescheduleRequestType.ADMIN_FORCE)
      throw new BadRequestException('Chỉ có thể xác nhận yêu cầu từ admin')
    if (request.status !== RescheduleRequestStatus.PENDING_MERCHANT)
      throw new BadRequestException(
        'Yêu cầu này không cần xác nhận hoặc đã được xử lý'
      )
    if (request.campaign.merchant.id !== merchant.id)
      throw new ForbiddenException('Bạn không có quyền xác nhận yêu cầu này')
    if (new Date() > request.expiresAt)
      throw new BadRequestException('Yêu cầu đã hết hạn')

    const oldStartTime = request.campaign.startTime

    await this.applyReschedule(
      requestId,
      request.campaignId,
      request.newStartTime,
      oldStartTime,
      request
    )

    const updated = await this.rescheduleRequestRepository.findById(requestId)
    return updated as RescheduleRequestResponseDto
  }

  /** Merchant từ chối yêu cầu force reschedule của admin */
  async rejectAdminReschedule(
    userId: string,
    requestId: string
  ): Promise<{ rejected: boolean }> {
    const merchant = await this.getApprovedMerchant(userId)

    const request = await this.rescheduleRequestRepository.findByIdWithDetails(
      requestId
    )
    if (!request)
      throw new NotFoundException('Yêu cầu thay đổi lịch không tồn tại')
    if (request.requestType !== RescheduleRequestType.ADMIN_FORCE)
      throw new BadRequestException('Chỉ có thể từ chối yêu cầu từ admin')
    if (request.status !== RescheduleRequestStatus.PENDING_MERCHANT)
      throw new BadRequestException(
        'Yêu cầu này không thể từ chối hoặc đã được xử lý'
      )
    if (request.campaign.merchant.id !== merchant.id)
      throw new ForbiddenException('Bạn không có quyền từ chối yêu cầu này')

    await this.rescheduleRequestRepository.update(requestId, {
      status: RescheduleRequestStatus.REJECTED,
      resolvedAt: new Date()
    })

    return { rejected: true }
  }

  /** Lấy danh sách yêu cầu thay đổi lịch đang chờ xác nhận của merchant */
  async getMerchantPendingRescheduleRequests(
    userId: string
  ): Promise<RescheduleRequestResponseDto[]> {
    await this.getApprovedMerchant(userId)
    const requests =
      await this.rescheduleRequestRepository.findPendingByMerchantUserId(userId)
    return requests as RescheduleRequestResponseDto[]
  }

  /** Áp dụng thay đổi lịch: cập nhật campaign.startTime + gửi thông báo subscribers */
  async applyReschedule(
    requestId: string,
    campaignId: string,
    newStartTime: Date,
    oldStartTime: Date,
    requestWithDetails?: Awaited<
      ReturnType<RescheduleRequestRepository['findByIdWithDetails']>
    >
  ): Promise<void> {
    await this.campaignRepository.update(campaignId, {
      startTime: newStartTime
    })

    await this.rescheduleRequestRepository.update(requestId, {
      status: RescheduleRequestStatus.APPLIED,
      resolvedAt: new Date()
    })

    const details =
      requestWithDetails ??
      (await this.rescheduleRequestRepository.findByIdWithDetails(requestId))
    if (!details) return

    const formattedOld = this.formatDateTime(oldStartTime)
    const formattedNew = this.formatDateTime(newStartTime)
    const subscribers = details.campaign.preRegistrations

    await Promise.allSettled(
      subscribers.map(async ({ customer }) => {
        try {
          await this.notificationService.createNotification(customer.id, {
            type: NotificationType.CAMPAIGN_RESCHEDULED,
            title: 'Thời gian bắt đầu campaign đã thay đổi',
            message: `Campaign "${details.campaign.name}" sẽ bắt đầu lúc ${formattedNew} (thay vì ${formattedOld})`
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
            campaignName: details.campaign.name,
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

  async getReport(userId: string, campaignId: string) {
    const merchant = await this.getApprovedMerchant(userId)
    const campaign = await this.campaignRepository.findByIdAndMerchant(
      campaignId,
      merchant.id
    )
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại')

    const raw = await this.campaignRepository.getReport(campaignId)
    const successOrders = raw.totalOrders - raw.cancelledOrders

    return {
      totalOrders: raw.totalOrders,
      successOrders,
      cancelledOrders: raw.cancelledOrders,
      totalRevenue: raw.totalRevenue,
      conversionRate:
        raw.totalReservations > 0
          ? Math.round((successOrders / raw.totalReservations) * 100 * 10) / 10
          : 0
    }
  }
}
