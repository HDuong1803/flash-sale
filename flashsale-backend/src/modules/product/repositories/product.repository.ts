import { Injectable } from '@nestjs/common'
import { Prisma, ProductStatus } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

const productInclude = {
  inventory: true,
  photo: { select: { url: true } }
} satisfies Prisma.ProductInclude

export type ProductWithPhoto = Prisma.ProductGetPayload<{
  include: typeof productInclude
}>

@Injectable()
export class ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ProductWithPhoto | null> {
    return this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: productInclude
    })
  }

  async findByIdAndMerchant(
    id: string,
    merchantId: string
  ): Promise<ProductWithPhoto | null> {
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
  ): Promise<ProductWithPhoto[]> {
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
    photoId?: string
    inventory: number
  }): Promise<ProductWithPhoto> {
    const { inventory, photoId, ...productData } = data
    return this.prisma.product.create({
      data: {
        ...productData,
        ...(photoId ? { productImageId: photoId } : {}),
        inventory: { create: { quantity: inventory } }
      },
      include: productInclude
    })
  }

  async update(
    id: string,
    data: Partial<{
      name: string
      description: string
      category: string
      originalPrice: number
      photoId: string
    }>
  ): Promise<ProductWithPhoto> {
    const { photoId, ...rest } = data
    return this.prisma.product.update({
      where: { id },
      data: {
        ...rest,
        ...(photoId !== undefined ? { productImageId: photoId } : {})
      },
      include: productInclude
    })
  }

  async toggleStatus(
    id: string,
    currentStatus: ProductStatus
  ): Promise<ProductWithPhoto> {
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
}
