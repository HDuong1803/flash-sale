import { Injectable } from '@nestjs/common'
import { Product, ProductStatus } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

@Injectable()
export class ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Product | null> {
    return this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { inventory: true }
    })
  }

  async findByIdAndMerchant(
    id: string,
    merchantId: string
  ): Promise<Product | null> {
    return this.prisma.product.findFirst({
      where: { id, merchantId, deletedAt: null }
    })
  }

  async findAllByMerchant(
    merchantId: string,
    filters: { search?: string; status?: string; page: number; limit: number }
  ) {
    return this.prisma.product.findMany({
      where: {
        merchantId,
        deletedAt: null,
        ...(filters.status ? { status: filters.status as ProductStatus } : {}),
        ...(filters.search
          ? { name: { contains: filters.search, mode: 'insensitive' as const } }
          : {})
      },
      include: { inventory: true },
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
    imageUrl?: string
    inventory: number
  }): Promise<Product> {
    const { inventory, ...productData } = data
    return this.prisma.product.create({
      data: { ...productData, inventory: { create: { quantity: inventory } } },
      include: { inventory: true }
    })
  }

  async update(
    id: string,
    data: Partial<{
      name: string
      description: string
      category: string
      originalPrice: number
      imageUrl: string
    }>
  ): Promise<Product> {
    return this.prisma.product.update({ where: { id }, data })
  }

  async toggleStatus(
    id: string,
    currentStatus: ProductStatus
  ): Promise<Product> {
    const next: ProductStatus =
      currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    return this.prisma.product.update({ where: { id }, data: { status: next } })
  }

  async getInventory(productId: string) {
    return this.prisma.inventory.findFirst({
      where: { productId, warehouseId: 'default' }
    })
  }
}
