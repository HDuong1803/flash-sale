import { Injectable } from '@nestjs/common'
import { Prisma, ProductStatus } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

const productInclude = {
  inventory: true,
  images: {
    orderBy: [
      { isPrimary: 'desc' as const },
      { sortOrder: 'asc' as const }
    ],
    include: {
      photo: { select: { url: true, file: { select: { uploadHash: true } } } }
    }
  }
} satisfies Prisma.ProductInclude

export type ProductWithImages = Prisma.ProductGetPayload<{
  include: typeof productInclude
}>

export function imageUrlsFromProduct(p: ProductWithImages): string[] {
  return p.images.map(img => img.photo.url)
}

@Injectable()
export class ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ProductWithImages | null> {
    return this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: productInclude
    })
  }

  async findByIdAndMerchant(
    id: string,
    merchantId: string
  ): Promise<ProductWithImages | null> {
    return this.prisma.product.findFirst({
      where: { id, merchantId, deletedAt: null },
      include: productInclude
    })
  }

  async findAllByMerchant(
    merchantId: string,
    filters: {
      search?: string
      status?: ProductStatus
      page: number
      limit: number
    }
  ): Promise<ProductWithImages[]> {
    return this.prisma.product.findMany({
      where: {
        merchantId,
        deletedAt: null,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.search
          ? { name: { contains: filters.search, mode: 'insensitive' as const } }
          : {})
      },
      include: productInclude,
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit
    })
  }

  async create(data: {
    merchantId: string
    name: string
    description?: string
    category?: string
    originalPrice: number
    inventory: number
  }): Promise<ProductWithImages> {
    const { inventory, ...productData } = data
    return this.prisma.product.create({
      data: {
        ...productData,
        inventory: { create: { quantity: inventory } }
      },
      include: productInclude
    })
  }

  async addImages(
    productId: string,
    entries: Array<{ photoId: string; sortOrder: number; isPrimary: boolean }>
  ): Promise<void> {
    await this.prisma.productImage.createMany({
      data: entries.map(e => ({ productId, ...e }))
    })
  }

  async deleteImage(
    productImageId: string,
    productId: string
  ): Promise<{ photoId: string; publicId: string | null } | null> {
    const img = await this.prisma.productImage.findFirst({
      where: { id: productImageId, productId },
      include: { photo: { include: { file: { select: { uploadHash: true } } } } }
    })
    if (!img) return null

    await this.prisma.productImage.delete({ where: { id: productImageId } })
    return { photoId: img.photoId, publicId: img.photo.file?.uploadHash ?? null }
  }

  async getImageCount(productId: string): Promise<number> {
    return this.prisma.productImage.count({ where: { productId } })
  }

  async update(
    id: string,
    data: Partial<{
      name: string
      description: string
      category: string
      originalPrice: number
    }>
  ): Promise<ProductWithImages> {
    return this.prisma.product.update({
      where: { id },
      data,
      include: productInclude
    })
  }

  async toggleStatus(
    id: string,
    currentStatus: ProductStatus
  ): Promise<ProductWithImages> {
    const next: ProductStatus =
      currentStatus === ProductStatus.ACTIVE
        ? ProductStatus.INACTIVE
        : ProductStatus.ACTIVE
    return this.prisma.product.update({
      where: { id },
      data: { status: next },
      include: productInclude
    })
  }

  async getInventory(productId: string) {
    return this.prisma.inventory.findFirst({
      where: { productId, warehouseId: 'default' }
    })
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() }
    })
  }

  async hasActiveCampaigns(productId: string): Promise<boolean> {
    const count = await this.prisma.campaignProduct.count({
      where: {
        productId,
        campaign: {
          deletedAt: null,
          status: { in: ['DRAFT', 'APPROVED', 'SCHEDULED', 'ACTIVE'] }
        }
      }
    })
    return count > 0
  }

  async getCampaignSummaries(
    productId: string
  ): Promise<Array<{ id: string; name: string; status: string; startTime: Date; endTime: Date; salePrice: number }>> {
    const rows = await this.prisma.campaignProduct.findMany({
      where: { productId, campaign: { deletedAt: null } },
      select: {
        salePrice: true,
        campaign: { select: { id: true, name: true, status: true, startTime: true, endTime: true } }
      },
      orderBy: { campaign: { startTime: 'desc' } }
    })
    return rows.map(r => ({ ...r.campaign, salePrice: Number(r.salePrice) }))
  }
}
