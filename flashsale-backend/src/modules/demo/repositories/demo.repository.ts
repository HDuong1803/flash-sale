import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

// 100 tên Việt Nam thực tế dùng cho historical customers
const VIET_NAMES = [
  'Nguyễn Văn An',
  'Trần Thị Bích',
  'Lê Hoàng Cường',
  'Phạm Thị Dung',
  'Hoàng Minh Đức',
  'Vũ Thị Hà',
  'Đặng Quốc Hùng',
  'Bùi Thị Hương',
  'Ngô Thanh Khoa',
  'Dương Thị Lan',
  'Đinh Văn Long',
  'Trịnh Thị Mai',
  'Lý Công Minh',
  'Phan Thị Nga',
  'Tô Văn Phong',
  'Hồ Thị Quỳnh',
  'Võ Minh Sơn',
  'Đỗ Thị Tâm',
  'Nguyễn Văn Thắng',
  'Trần Thị Thu',
  'Lê Quốc Toàn',
  'Phạm Thị Trang',
  'Hoàng Văn Trung',
  'Vũ Thị Tuyết',
  'Đặng Minh Tuấn',
  'Bùi Văn Út',
  'Ngô Thị Vân',
  'Dương Văn Việt',
  'Đinh Thị Xuân',
  'Trịnh Văn Yên',
  'Lý Thị Ánh',
  'Phan Văn Bảo',
  'Tô Thị Chi',
  'Hồ Văn Chiến',
  'Võ Thị Duyên',
  'Đỗ Văn Em',
  'Nguyễn Thị Giang',
  'Trần Văn Hải',
  'Lê Thị Hiền',
  'Phạm Văn Hiếu',
  'Hoàng Thị Hoa',
  'Vũ Văn Hoàng',
  'Đặng Thị Huệ',
  'Bùi Văn Hưng',
  'Ngô Thị Khánh',
  'Dương Văn Kiên',
  'Đinh Thị Kim',
  'Trịnh Văn Lâm',
  'Lý Thị Liên',
  'Phan Văn Linh',
  'Tô Thị Loan',
  'Hồ Văn Lộc',
  'Võ Thị Lý',
  'Đỗ Văn Mạnh',
  'Nguyễn Thị Mỹ',
  'Trần Văn Nam',
  'Lê Thị Ngân',
  'Phạm Văn Nghĩa',
  'Hoàng Thị Nhung',
  'Vũ Văn Ninh',
  'Đặng Thị Nhi',
  'Bùi Văn Quân',
  'Ngô Thị Quyên',
  'Dương Văn Quý',
  'Đinh Thị Oanh',
  'Trịnh Văn Phát',
  'Lý Thị Phương',
  'Phan Văn Phúc',
  'Tô Thị Phượng',
  'Hồ Văn Quang',
  'Võ Thị Ry',
  'Đỗ Văn Sang',
  'Nguyễn Thị Sen',
  'Trần Văn Sơn',
  'Lê Thị Suốt',
  'Phạm Văn Tài',
  'Hoàng Thị Thanh',
  'Vũ Văn Thiện',
  'Đặng Thị Thoa',
  'Bùi Văn Thọ',
  'Ngô Thị Thơm',
  'Dương Văn Thống',
  'Đinh Thị Thúy',
  'Trịnh Văn Thương',
  'Lý Thị Tiên',
  'Phan Văn Tiến',
  'Tô Thị Tình',
  'Hồ Văn Tùng',
  'Võ Thị Tươi',
  'Đỗ Văn Tứ',
  'Nguyễn Thị Uyên',
  'Trần Văn Vinh',
  'Lê Thị Vui',
  'Phạm Văn Vượng',
  'Hoàng Thị Ý',
  'Vũ Văn Yên',
  'Đặng Thị Ý Nhi',
  'Bùi Văn Đạt',
  'Ngô Thị Đào',
  'Dương Văn Đông'
]

/**
 * DemoRepository — truy cập DB cho demo/load-test module
 * Chỉ chứa các query phục vụ seed lịch sử và load test.
 * Xóa module này khi không cần demo nữa.
 */
@Injectable()
export class DemoRepository {
  private readonly logger = new Logger(DemoRepository.name)

  constructor(private readonly prisma: PrismaService) {}

  // ─── Đọc dữ liệu cho load test ───────────────────────────────────────────────

  /** Lấy campaign đang ACTIVE cùng với các CampaignProducts */
  async findActiveCampaignById(campaignId: string) {
    return this.prisma.campaign.findUnique({
      where: { id: campaignId, status: 'ACTIVE' },
      include: {
        campaignProducts: {
          select: {
            id: true,
            salePrice: true,
            saleQuantity: true,
            remainingQuantity: true,
            perUserLimit: true
          }
        }
      }
    })
  }

  /** Lấy danh sách customers lịch sử (hist-customer-xxx) để dùng cho load test */
  async findHistoricalCustomers(
    limit: number
  ): Promise<{ id: string; email: string }[]> {
    return this.prisma.user.findMany({
      where: { email: { startsWith: 'hist-customer-' } },
      select: { id: true, email: true },
      take: limit
    })
  }

  /** Tạo historical customer nếu chưa có đủ */
  async upsertHistCustomer(
    idx: number,
    passwordHash: string
  ): Promise<{ id: string; email: string }> {
    const pad = String(idx).padStart(3, '0')
    const email = `hist-customer-${pad}@test.vn`

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true }
    })
    if (existing) return existing

    const user = await this.prisma.user.create({
      data: {
        email,
        fullName: VIET_NAMES[(idx - 1) % VIET_NAMES.length],
        passwordHash,
        role: 'CUSTOMER',
        emailVerified: true,
        status: 'ACTIVE',
        customerProfile: {
          create: {
            phone: `090${String(9000000 + idx).slice(1)}`,
            defaultAddress: `${idx} Test Street, TP.HCM`
          }
        }
      },
      select: { id: true, email: true }
    })
    return user
  }

  // ─── Cleanup demo data ────────────────────────────────────────────────────────

  /**
   * Xóa toàn bộ dữ liệu lịch sử do seed-historical tạo ra.
   * Xóa theo thứ tự FK (leaf → root) để tránh constraint violations.
   */
  async cleanupHistoricalData(): Promise<{
    deletedMerchants: number
    deletedCustomers: number
    deletedCampaigns: number
    deletedOrders: number
  }> {
    this.logger.log('Bắt đầu cleanup historical data...')

    // Tìm historical merchant profiles
    const histMerchants = await this.prisma.merchantProfile.findMany({
      where: { taxCode: { in: ['9901230001', '9901230002'] } },
      select: { id: true, userId: true }
    })
    const histMerchantIds = histMerchants.map(m => m.id)
    const histMerchantUserIds = histMerchants.map(m => m.userId)

    // Tìm campaigns của historical merchants
    const histCampaigns = await this.prisma.campaign.findMany({
      where: { merchantId: { in: histMerchantIds } },
      select: { id: true }
    })
    const histCampaignIds = histCampaigns.map(c => c.id)

    // Tìm CampaignProducts
    const histCPs = await this.prisma.campaignProduct.findMany({
      where: { campaignId: { in: histCampaignIds } },
      select: { id: true }
    })
    const histCPIds = histCPs.map(cp => cp.id)

    // Đếm trước để báo cáo
    const orderCount = await this.prisma.order.count({
      where: { merchantId: { in: histMerchantIds } }
    })

    // Tìm historical customers
    const histCustomers = await this.prisma.user.findMany({
      where: { email: { startsWith: 'hist-customer-' } },
      select: { id: true }
    })
    const histCustomerIds = histCustomers.map(c => c.id)

    // Xóa theo thứ tự FK: leaf → root
    const tables = [
      // 1. Xóa commission ledgers (FK: orderId)
      this.prisma.commissionLedger.deleteMany({
        where: { merchantId: { in: histMerchantIds } }
      }),
      // 2. Xóa funnel events
      this.prisma.funnelEvent.deleteMany({
        where: { campaignId: { in: histCampaignIds } }
      }),
      // 3. Xóa analytics snapshots
      this.prisma.campaignAnalyticsSnapshot.deleteMany({
        where: { campaignId: { in: histCampaignIds } }
      })
    ]
    await Promise.all(tables)

    // 4. Xóa payments (FK: reservationId, orderId)
    await this.prisma.payment.deleteMany({
      where: { reservation: { campaignProductId: { in: histCPIds } } }
    })

    // 5. Xóa order items + orders
    await this.prisma.orderItem.deleteMany({
      where: { order: { merchantId: { in: histMerchantIds } } }
    })
    await this.prisma.order.deleteMany({
      where: { merchantId: { in: histMerchantIds } }
    })

    // 6. Xóa stock allocations + reservations
    await this.prisma.stockAllocation.deleteMany({
      where: { campaignProductId: { in: histCPIds } }
    })
    await this.prisma.reservation.deleteMany({
      where: { campaignProductId: { in: histCPIds } }
    })

    // 7. Xóa campaign products + campaigns
    await this.prisma.campaignProduct.deleteMany({
      where: { campaignId: { in: histCampaignIds } }
    })
    await this.prisma.campaign.deleteMany({
      where: { id: { in: histCampaignIds } }
    })

    // 8. Xóa products của historical merchants
    const histProducts = await this.prisma.product.findMany({
      where: { merchantId: { in: histMerchantIds } },
      include: { images: { select: { photoId: true } } }
    })
    const histPhotoIds = histProducts.flatMap(p => p.images.map(i => i.photoId))
    await this.prisma.productImage.deleteMany({
      where: { productId: { in: histProducts.map(p => p.id) } }
    })
    await this.prisma.inventory.deleteMany({
      where: { productId: { in: histProducts.map(p => p.id) } }
    })
    await this.prisma.product.deleteMany({
      where: { merchantId: { in: histMerchantIds } }
    })

    // 9. Xóa ảnh + file entities của historical products
    const photoFileIds = await this.prisma.photo.findMany({
      where: { id: { in: histPhotoIds } },
      select: { fileEntityId: true }
    })
    await this.prisma.photo.deleteMany({ where: { id: { in: histPhotoIds } } })
    await this.prisma.fileEntity.deleteMany({
      where: { id: { in: photoFileIds.map(p => p.fileEntityId) } }
    })

    // 10. Xóa merchant profiles + users
    await this.prisma.merchantProfile.deleteMany({
      where: { id: { in: histMerchantIds } }
    })
    await this.prisma.user.deleteMany({
      where: { id: { in: histMerchantUserIds } }
    })

    // 11. Xóa historical customers
    await this.prisma.customerProfile.deleteMany({
      where: { userId: { in: histCustomerIds } }
    })
    await this.prisma.user.deleteMany({
      where: { id: { in: histCustomerIds } }
    })

    this.logger.log('Cleanup hoàn tất')
    return {
      deletedMerchants: histMerchants.length,
      deletedCustomers: histCustomers.length,
      deletedCampaigns: histCampaigns.length,
      deletedOrders: orderCount
    }
  }

  // ─── Tạo historical merchant ─────────────────────────────────────────────────

  /** Kiểm tra user đã tồn tại theo email */
  async findUserByEmail(email: string): Promise<{ id: string } | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true }
    })
  }

  /** Tìm merchantProfile theo userId */
  async findMerchantProfileByUserId(
    userId: string
  ): Promise<{ id: string } | null> {
    return this.prisma.merchantProfile.findUnique({
      where: { userId },
      select: { id: true }
    })
  }

  /** Tạo user với role MERCHANT */
  async createMerchantUser(data: {
    email: string
    fullName: string
    passwordHash: string
  }): Promise<{ id: string }> {
    return this.prisma.user.create({
      data: {
        email: data.email,
        fullName: data.fullName,
        passwordHash: data.passwordHash,
        role: 'MERCHANT',
        emailVerified: true,
        status: 'ACTIVE'
      },
      select: { id: true }
    })
  }

  /** Tạo merchantProfile với trạng thái APPROVED */
  async createMerchantProfile(data: {
    userId: string
    businessName: string
    taxCode: string
    phone: string
    address: string
    approvedBy: string | null
  }): Promise<{ id: string }> {
    return this.prisma.merchantProfile.create({
      data: {
        userId: data.userId,
        businessName: data.businessName,
        taxCode: data.taxCode,
        description: 'Merchant lịch sử — analytics demo data',
        phone: data.phone,
        address: data.address,
        kycStatus: 'APPROVED',
        approvedAt: new Date('2026-01-10'),
        approvedBy: data.approvedBy
      },
      select: { id: true }
    })
  }

  // ─── Tìm admin để set approvedBy ─────────────────────────────────────────────
  async findAdminId(): Promise<string | null> {
    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true }
    })
    return admin?.id ?? null
  }

  // ─── Upsert commission categories ─────────────────────────────────────────────
  async upsertCommissionCategories() {
    const [elec, home] = await Promise.all([
      this.prisma.commissionCategory.upsert({
        where: { code: 'ELECTRONICS' },
        update: {},
        create: {
          code: 'ELECTRONICS',
          name: 'Điện tử - Công nghệ',
          defaultRate: 0.05,
          isActive: true,
          sortOrder: 1
        }
      }),
      this.prisma.commissionCategory.upsert({
        where: { code: 'HOME_APPLIANCE' },
        update: {},
        create: {
          code: 'HOME_APPLIANCE',
          name: 'Đồ gia dụng',
          defaultRate: 0.06,
          isActive: true,
          sortOrder: 3
        }
      })
    ])
    return { elec, home }
  }

  /** Tạo file entity + photo + product với inventory */
  async createHistProduct(data: {
    merchantId: string
    name: string
    description: string
    originalPrice: number
    imageUrl: string
    imageKey: string
    inventoryQty: number
    feId: string
    phId: string
  }) {
    await this.prisma.fileEntity.create({
      data: {
        id: data.feId,
        fileName: `${data.imageKey}.jpg`,
        url: data.imageUrl,
        mimeType: 'image/jpeg',
        size: 204800,
        description: `Ảnh sản phẩm lịch sử: ${data.name}`,
        Photo: { create: { id: data.phId, url: data.imageUrl } }
      }
    })

    return this.prisma.product.create({
      data: {
        merchantId: data.merchantId,
        name: data.name,
        description: data.description,
        originalPrice: data.originalPrice,
        status: 'ACTIVE',
        inventory: { create: { quantity: data.inventoryQty, reserved: 0 } },
        images: {
          create: { photoId: data.phId, isPrimary: true, sortOrder: 0 }
        }
      }
    })
  }

  /** Tạo campaign lịch sử */
  async createHistCampaign(data: {
    merchantId: string
    commissionCategoryId: string
    name: string
    description: string
    startTime: Date
    endTime: Date
    commissionRate: number
    approvedBy: string | null
    createdAt: Date
    approvedAt: Date
  }) {
    return this.prisma.campaign.create({ data: { ...data, status: 'ENDED' } })
  }

  /** Tạo campaign product */
  async createCampaignProduct(data: {
    campaignId: string
    productId: string
    salePrice: number
    saleQuantity: number
    perUserLimit: number
    createdAt: Date
  }) {
    return this.prisma.campaignProduct.create({
      data: { ...data, remainingQuantity: 0 }
    })
  }

  /** Batch insert toàn bộ order chain (reservation → stock → order → item → payment → commission) */
  async batchInsertOrderChain(data: {
    reservations: Prisma.ReservationCreateManyInput[]
    stockAllocations: Prisma.StockAllocationCreateManyInput[]
    orders: Prisma.OrderCreateManyInput[]
    orderItems: Prisma.OrderItemCreateManyInput[]
    payments: Prisma.PaymentCreateManyInput[]
    commissionLedgers: Prisma.CommissionLedgerCreateManyInput[]
  }) {
    await this.prisma.reservation.createMany({
      data: data.reservations,
      skipDuplicates: true
    })
    await this.prisma.stockAllocation.createMany({
      data: data.stockAllocations,
      skipDuplicates: true
    })
    await this.prisma.order.createMany({
      data: data.orders,
      skipDuplicates: true
    })
    await this.prisma.orderItem.createMany({
      data: data.orderItems,
      skipDuplicates: true
    })
    await this.prisma.payment.createMany({
      data: data.payments,
      skipDuplicates: true
    })
    await this.prisma.commissionLedger.createMany({
      data: data.commissionLedgers,
      skipDuplicates: true
    })
  }

  /** Batch insert analytics snapshots theo chunks */
  async batchInsertSnapshots(
    data: Prisma.CampaignAnalyticsSnapshotCreateManyInput[]
  ): Promise<void> {
    const CHUNK = 500
    for (let i = 0; i < data.length; i += CHUNK) {
      await this.prisma.campaignAnalyticsSnapshot.createMany({
        data: data.slice(i, i + CHUNK)
      })
    }
  }

  /** Batch insert funnel events theo chunks */
  async batchInsertFunnelEvents(
    data: Prisma.FunnelEventCreateManyInput[]
  ): Promise<void> {
    const CHUNK = 1000
    for (let i = 0; i < data.length; i += CHUNK) {
      await this.prisma.funnelEvent.createMany({
        data: data.slice(i, i + CHUNK)
      })
    }
  }
}
