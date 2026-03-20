import {
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { KycStatus } from '@prisma/client'
import { MerchantRepository } from '@modules/merchant/repositories/merchant.repository'
import { FileService } from '@modules/file/services/file.service'
import {
  ProductRepository,
  ProductWithPhoto
} from '../repositories/product.repository'
import {
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto
} from '../dto/product.dto'

function toProductResponse(p: ProductWithPhoto) {
  const inv = p.inventory[0]
  return {
    ...p,
    imageUrl: p.photo?.url ?? null,
    inventory: inv ? Math.max(0, inv.quantity - inv.reserved) : 0
  }
}

@Injectable()
export class ProductService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly merchantRepository: MerchantRepository,
    private readonly fileService: FileService
  ) {}

  private async getApprovedMerchant(userId: string) {
    const merchant = await this.merchantRepository.findByUserId(userId)
    if (!merchant) throw new ForbiddenException('Bạn chưa đăng ký làm merchant')
    if (merchant.kycStatus !== KycStatus.APPROVED)
      throw new ForbiddenException('Tài khoản merchant chưa được duyệt')
    return merchant
  }

  async create(
    userId: string,
    dto: CreateProductDto,
    file?: Express.Multer.File
  ) {
    const merchant = await this.getApprovedMerchant(userId)

    let photoId: string | undefined
    if (file) {
      const photo = await this.fileService.createPhoto(file)
      photoId = photo.photoId
    }

    const product = await this.productRepository.create({
      merchantId: merchant.id,
      ...dto,
      photoId
    })
    return toProductResponse(product)
  }

  async findAll(userId: string, query: ProductQueryDto) {
    const merchant = await this.getApprovedMerchant(userId)
    const products = await this.productRepository.findAllByMerchant(
      merchant.id,
      {
        search: query.search,
        status: query.status,
        page: query.page ?? 1,
        limit: query.limit ?? 10
      }
    )
    return products.map(toProductResponse)
  }

  async update(
    userId: string,
    productId: string,
    dto: UpdateProductDto,
    file?: Express.Multer.File
  ) {
    const merchant = await this.getApprovedMerchant(userId)
    const product = await this.productRepository.findByIdAndMerchant(
      productId,
      merchant.id
    )
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại')

    let photoId: string | undefined
    if (file) {
      const photo = await this.fileService.createPhoto(file)
      photoId = photo.photoId
    }

    const updated = await this.productRepository.update(productId, {
      ...dto,
      photoId
    })
    return toProductResponse(updated)
  }

  async toggleStatus(userId: string, productId: string) {
    const merchant = await this.getApprovedMerchant(userId)
    const product = await this.productRepository.findByIdAndMerchant(
      productId,
      merchant.id
    )
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại')
    const updated = await this.productRepository.toggleStatus(
      productId,
      product.status
    )
    return toProductResponse(updated)
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
