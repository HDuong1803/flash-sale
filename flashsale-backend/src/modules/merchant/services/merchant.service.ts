import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { MerchantRepository } from '../repositories/merchant.repository'
import { ApplyMerchantDto, MerchantOrderQueryDto } from '../dto/merchant.dto'

@Injectable()
export class MerchantService {
  constructor(private readonly merchantRepository: MerchantRepository) {}

  async apply(userId: string, dto: ApplyMerchantDto) {
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
