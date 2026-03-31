import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { KycStatus } from '@prisma/client'
import { MerchantRepository } from '@modules/merchant/repositories/merchant.repository'
import { FileService } from '@modules/file/services/file.service'
import {
  ProductRepository,
  ProductWithImages,
  imageUrlsFromProduct
} from '../repositories/product.repository'
import {
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto
} from '../dto/product.dto'

const MAX_IMAGES_PER_PRODUCT = 10
const MIN_IMAGES_PER_PRODUCT = 3

function toProductResponse(p: ProductWithImages) {
  const inv = p.inventory[0]
  const imageUrls = imageUrlsFromProduct(p)
  const images = p.images.map(img => ({
    id: img.id,
    url: img.photo.url,
    isPrimary: img.isPrimary,
    sortOrder: img.sortOrder
  }))
  return {
    ...p,
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
    images,
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
    files: Express.Multer.File[] = []
  ) {
    if (files.length < MIN_IMAGES_PER_PRODUCT) {
      throw new BadRequestException(
        `Cần upload ít nhất ${MIN_IMAGES_PER_PRODUCT} ảnh để tạo sản phẩm`
      )
    }

    const merchant = await this.getApprovedMerchant(userId)

    const product = await this.productRepository.create({
      merchantId: merchant.id,
      ...dto
    })

    const uploaded = await Promise.all(
      files.map(f => this.fileService.createPhoto(f))
    )
    await this.productRepository.addImages(
      product.id,
      uploaded.map((p, i) => ({
        photoId: p.photoId,
        sortOrder: i,
        isPrimary: i === 0
      }))
    )

    const fresh = await this.productRepository.findById(product.id)
    // fresh will always be found right after create
    return toProductResponse(fresh!)
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
    files: Express.Multer.File[] = []
  ) {
    const merchant = await this.getApprovedMerchant(userId)
    const product = await this.productRepository.findByIdAndMerchant(
      productId,
      merchant.id
    )
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại')

    if (files.length > 0) {
      const currentCount = await this.productRepository.getImageCount(productId)
      const available = MAX_IMAGES_PER_PRODUCT - currentCount
      if (available <= 0) {
        throw new BadRequestException(
          `Sản phẩm đã đạt tối đa ${MAX_IMAGES_PER_PRODUCT} ảnh`
        )
      }
      const toUpload = files.slice(0, available)
      // Edge case: nếu sản phẩm đang có ít hơn MIN_IMAGES, đảm bảo tổng sau khi thêm >= MIN_IMAGES
      if (currentCount + toUpload.length < MIN_IMAGES_PER_PRODUCT) {
        throw new BadRequestException(
          `Sản phẩm phải có ít nhất ${MIN_IMAGES_PER_PRODUCT} ảnh. ` +
            `Hiện có ${currentCount} ảnh, cần thêm ít nhất ${
              MIN_IMAGES_PER_PRODUCT - currentCount
            } ảnh`
        )
      }
      const uploaded = await Promise.all(
        toUpload.map(f => this.fileService.createPhoto(f))
      )
      await this.productRepository.addImages(
        productId,
        uploaded.map((p, i) => ({
          photoId: p.photoId,
          sortOrder: currentCount + i,
          isPrimary: currentCount === 0 && i === 0
        }))
      )
    }

    const updated = await this.productRepository.update(productId, dto)
    return toProductResponse(updated)
  }

  async deleteImage(
    userId: string,
    productId: string,
    productImageId: string
  ): Promise<void> {
    const merchant = await this.getApprovedMerchant(userId)
    const product = await this.productRepository.findByIdAndMerchant(
      productId,
      merchant.id
    )
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại')

    const currentCount = await this.productRepository.getImageCount(productId)
    if (currentCount <= MIN_IMAGES_PER_PRODUCT) {
      throw new BadRequestException(
        `Sản phẩm phải có ít nhất ${MIN_IMAGES_PER_PRODUCT} ảnh. ` +
          `Hãy thêm ảnh mới trước khi xóa`
      )
    }

    const deleted = await this.productRepository.deleteImage(
      productImageId,
      productId
    )
    if (!deleted) throw new NotFoundException('Ảnh không tồn tại')

    if (deleted.publicId) {
      await this.fileService.deleteByPublicId(deleted.publicId)
    }
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

  async getById(userId: string, productId: string) {
    const merchant = await this.getApprovedMerchant(userId)
    const product = await this.productRepository.findByIdAndMerchant(
      productId,
      merchant.id
    )
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại')
    const campaigns = await this.productRepository.getCampaignSummaries(
      productId
    )
    return { ...toProductResponse(product), campaigns }
  }

  async delete(userId: string, productId: string): Promise<void> {
    const merchant = await this.getApprovedMerchant(userId)
    const product = await this.productRepository.findByIdAndMerchant(
      productId,
      merchant.id
    )
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại')

    const hasActive = await this.productRepository.hasActiveCampaigns(productId)
    if (hasActive)
      throw new BadRequestException(
        'Không thể xoá sản phẩm đang tham gia chiến dịch'
      )

    await this.productRepository.softDelete(productId)
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
