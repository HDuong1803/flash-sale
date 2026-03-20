import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { CampaignStatus, KycStatus } from '@prisma/client'
import { MerchantRepository } from '@modules/merchant/repositories/merchant.repository'
import { ProductRepository } from '@modules/product/repositories/product.repository'
import { CampaignRepository } from '../repositories/campaign.repository'
import {
  AddCampaignProductDto,
  CreateCampaignDto,
  CampaignQueryDto,
  UpdateCampaignDto
} from '../dto/campaign.dto'

@Injectable()
export class CampaignService {
  constructor(
    private readonly campaignRepository: CampaignRepository,
    private readonly merchantRepository: MerchantRepository,
    private readonly productRepository: ProductRepository
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

  async findOne(id: string) {
    const campaign = await this.campaignRepository.findByIdWithProducts(id)
    if (!campaign) throw new NotFoundException('Chiến dịch không tồn tại')
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
