import {
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { MerchantRepository } from '@modules/merchant/repositories/merchant.repository'
import { ProductRepository } from '../repositories/product.repository'
import {
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto
} from '../dto/product.dto'

@Injectable()
export class ProductService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly merchantRepository: MerchantRepository
  ) {}

  private async getApprovedMerchant(userId: string) {
    const merchant = await this.merchantRepository.findByUserId(userId)
    if (!merchant) throw new ForbiddenException('Bạn chưa đăng ký làm merchant')
    if (merchant.kycStatus !== 'APPROVED')
      throw new ForbiddenException('Tài khoản merchant chưa được duyệt')
    return merchant
  }

  async create(userId: string, dto: CreateProductDto) {
    const merchant = await this.getApprovedMerchant(userId)
    return this.productRepository.create({ merchantId: merchant.id, ...dto })
  }

  async findAll(userId: string, query: ProductQueryDto) {
    const merchant = await this.getApprovedMerchant(userId)
    return this.productRepository.findAllByMerchant(merchant.id, {
      search: query.search,
      status: query.status,
      page: query.page ?? 1,
      limit: query.limit ?? 10
    })
  }

  async update(userId: string, productId: string, dto: UpdateProductDto) {
    const merchant = await this.getApprovedMerchant(userId)
    const product = await this.productRepository.findByIdAndMerchant(
      productId,
      merchant.id
    )
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại')
    return this.productRepository.update(productId, dto)
  }

  async toggleStatus(userId: string, productId: string) {
    const merchant = await this.getApprovedMerchant(userId)
    const product = await this.productRepository.findByIdAndMerchant(
      productId,
      merchant.id
    )
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại')
    return this.productRepository.toggleStatus(productId, product.status)
  }

  async getInventory(userId: string, productId: string) {
    const merchant = await this.getApprovedMerchant(userId)
    const product = await this.productRepository.findByIdAndMerchant(
      productId,
      merchant.id
    )
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại')

    const inventory = await this.productRepository.getInventory(productId)
    if (!inventory)
      throw new NotFoundException('Không tìm thấy thông tin tồn kho')

    return {
      productId,
      quantity: inventory.quantity,
      reserved: inventory.reserved,
      available: inventory.quantity - inventory.reserved
    }
  }
}
