import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { MerchantRepository } from '../repositories/merchant.repository'
import {
  ApplyMerchantDto,
  MerchantOrderQueryDto,
  MerchantRevenuePeriodDto
} from '../dto/merchant.dto'

@Injectable()
export class MerchantService {
  constructor(private readonly merchantRepository: MerchantRepository) {}

  async apply(userId: string, userRole: string, dto: ApplyMerchantDto) {
    if (userRole !== 'CUSTOMER') {
      throw new ForbiddenException(
        'Chỉ tài khoản CUSTOMER mới có thể đăng ký làm Merchant'
      )
    }

    const existing = await this.merchantRepository.findByUserId(userId)
    if (existing)
      throw new BadRequestException('Bạn đã gửi đơn đăng ký trước đó')

    const taxExists = await this.merchantRepository.findByTaxCode(dto.taxCode)
    if (taxExists) throw new BadRequestException('Mã số thuế đã được sử dụng')

    return this.merchantRepository.create({ userId, ...dto })
  }

  async getApplicationStatus(userId: string) {
    return this.merchantRepository.findByUserId(userId)
  }

  async getMyCampaigns(userId: string) {
    return this.merchantRepository.findMyCampaigns(userId)
  }

  async getMyProfile(userId: string) {
    const profile = await this.merchantRepository.findByUserId(userId)
    if (!profile)
      throw new NotFoundException('Không tìm thấy thông tin merchant')
    return profile
  }

  async getStats(userId: string) {
    const merchant = await this.merchantRepository.findByUserId(userId)
    if (!merchant)
      throw new NotFoundException('Không tìm thấy thông tin merchant')
    return this.merchantRepository.getStats(merchant.id)
  }

  async getRevenue(userId: string, query: MerchantRevenuePeriodDto) {
    const merchant = await this.merchantRepository.findByUserId(userId)
    if (!merchant)
      throw new NotFoundException('Không tìm thấy thông tin merchant')

    const now = new Date()
    // endDate: cuối ngày hôm nay nếu không truyền
    const endDate = query.endDate
      ? new Date(query.endDate + 'T23:59:59.999Z')
      : now
    // startDate: 30 ngày trước nếu không truyền
    const startDate = query.startDate
      ? new Date(query.startDate + 'T00:00:00.000Z')
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000)

    if (startDate >= endDate)
      throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc')

    const days = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
    )
    const prevStartDate = new Date(
      startDate.getTime() - days * 24 * 60 * 60 * 1000
    )

    const raw = await this.merchantRepository.getRevenue(
      merchant.id,
      startDate,
      endDate,
      prevStartDate
    )

    // Summary
    const growthRate =
      raw.revenuePrevious > 0
        ? Math.round(
            ((raw.revenueCurrent - raw.revenuePrevious) / raw.revenuePrevious) *
              1000
          ) / 10
        : raw.revenueCurrent > 0
        ? 100
        : 0
    const avgOrderValue =
      raw.successOrders > 0
        ? Math.round(raw.revenueCurrent / raw.successOrders)
        : 0

    // Daily revenue — tạo đủ N ngày, điền 0 cho ngày không có đơn
    const dailyMap = new Map<string, { revenue: number; orders: number }>()
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
      dailyMap.set(d.toISOString().split('T')[0], { revenue: 0, orders: 0 })
    }
    for (const o of raw.dailyOrders) {
      const key = new Date(o.createdAt).toISOString().split('T')[0]
      const entry = dailyMap.get(key)
      if (entry) {
        entry.revenue += Number(o.totalAmount)
        entry.orders += 1
      }
    }
    const dailyRevenue = Array.from(dailyMap.entries()).map(([date, v]) => ({
      date,
      ...v
    }))

    // By campaign
    const campaignMap = new Map<
      string,
      {
        campaignName: string
        campaignStatus: string
        revenue: number
        orders: number
      }
    >()
    for (const o of raw.ordersWithCampaign) {
      const campaign = o.reservation?.campaignProduct?.campaign
      if (!campaign) continue
      const existing = campaignMap.get(campaign.id)
      if (existing) {
        existing.revenue += Number(o.totalAmount)
        existing.orders += 1
      } else {
        campaignMap.set(campaign.id, {
          campaignName: campaign.name,
          campaignStatus: campaign.status,
          revenue: Number(o.totalAmount),
          orders: 1
        })
      }
    }
    const byCampaign = Array.from(campaignMap.entries())
      .map(([campaignId, v]) => ({ campaignId, ...v }))
      .sort((a, b) => b.revenue - a.revenue)

    // Top 5 products
    const productMap = new Map<
      string,
      { productName: string; revenue: number; quantity: number }
    >()
    for (const item of raw.orderItems) {
      const itemRevenue = Number(item.unitPrice) * item.quantity
      const existing = productMap.get(item.productId)
      if (existing) {
        existing.revenue += itemRevenue
        existing.quantity += item.quantity
      } else {
        productMap.set(item.productId, {
          productName: item.product.name,
          revenue: itemRevenue,
          quantity: item.quantity
        })
      }
    }
    const topProducts = Array.from(productMap.entries())
      .map(([productId, v]) => ({ productId, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    return {
      summary: {
        totalRevenue: raw.totalRevenue,
        revenueThisPeriod: raw.revenueCurrent,
        revenuePreviousPeriod: raw.revenuePrevious,
        growthRate,
        totalOrders: raw.totalOrders,
        successOrders: raw.successOrders,
        cancelledOrders: raw.cancelledOrders,
        avgOrderValue
      },
      dailyRevenue,
      byCampaign,
      topProducts
    }
  }

  async getOrders(userId: string, query: MerchantOrderQueryDto) {
    const merchant = await this.merchantRepository.findByUserId(userId)
    if (!merchant)
      throw new NotFoundException('Không tìm thấy thông tin merchant')
    return this.merchantRepository.getOrders(merchant.id, {
      status: query.status,
      page: query.page ?? 1,
      limit: query.limit ?? 10
    })
  }
}
