/**
 * TC-02 (phần 1) — Vòng đời chiến dịch Flash Sale
 *
 * TC-02-01: Tạo và nộp chiến dịch hợp lệ → trạng thái → APPROVED
 * TC-02-02: Nộp chiến dịch không có sản phẩm → từ chối với thông báo lỗi
 * TC-02-03: Thêm sản phẩm với giá flash ≥ giá gốc → từ chối, báo lỗi ràng buộc
 */

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common'
import { CampaignStatus, KycStatus } from '@prisma/client'
import { CampaignService } from './campaign.service'

// ─── Mock factories ────────────────────────────────────────────────────────────

const makeMerchant = (overrides: Record<string, unknown> = {}) => ({
  id: 'merchant-id',
  userId: 'user-id',
  businessName: 'Test Shop',
  kycStatus: KycStatus.APPROVED,
  ...overrides
})

const makeCampaign = (overrides: Record<string, unknown> = {}) => ({
  id: 'campaign-id',
  name: 'Test Flash Sale',
  status: CampaignStatus.DRAFT,
  campaignProducts: [],
  ...overrides
})

const makeProduct = (overrides: Record<string, unknown> = {}) => ({
  id: 'product-id',
  merchantId: 'merchant-id',
  name: 'Test Product',
  originalPrice: 100_000,
  ...overrides
})

const makeCampaignRepo = () => ({
  findCommissionCategoryById: jest.fn(),
  create: jest.fn(),
  findAll: jest.fn(),
  findByIdWithProducts: jest.fn(),
  findByIdAndMerchant: jest.fn(),
  findByIdAndMerchantWithProducts: jest.fn(),
  addProduct: jest.fn(),
  removeProduct: jest.fn(),
  delete: jest.fn(),
  updateStatus: jest.fn(),
  findActiveCommissionCategories: jest.fn(),
  hideExpiredByMerchant: jest.fn()
})

const makeMerchantRepo = () => ({
  findByUserId: jest.fn()
})

const makeProductRepo = () => ({
  findByIdAndMerchant: jest.fn(),
  getInventory: jest.fn()
})

const makeRescheduleRepo = () => ({
  findPending: jest.fn()
})

const makeNotificationService = () => ({
  notifyAdmins: jest.fn().mockResolvedValue(undefined),
  createNotification: jest.fn().mockResolvedValue(undefined)
})

const makeEmailService = () => ({
  sendCampaignApproved: jest.fn().mockResolvedValue(undefined),
  sendCampaignRejected: jest.fn().mockResolvedValue(undefined)
})

const makeRedis = () => ({
  getStock: jest.fn().mockResolvedValue(null)
})

const buildService = (
  overrides: {
    campaignRepo?: ReturnType<typeof makeCampaignRepo>
    merchantRepo?: ReturnType<typeof makeMerchantRepo>
    productRepo?: ReturnType<typeof makeProductRepo>
    notificationService?: ReturnType<typeof makeNotificationService>
    emailService?: ReturnType<typeof makeEmailService>
    redis?: ReturnType<typeof makeRedis>
  } = {}
) => {
  const campaignRepo = overrides.campaignRepo ?? makeCampaignRepo()
  const merchantRepo = overrides.merchantRepo ?? makeMerchantRepo()
  const productRepo = overrides.productRepo ?? makeProductRepo()
  const notificationService =
    overrides.notificationService ?? makeNotificationService()
  const emailService = overrides.emailService ?? makeEmailService()
  const redis = overrides.redis ?? makeRedis()
  const rescheduleRepo = makeRescheduleRepo()

  const service = new CampaignService(
    campaignRepo as never,
    merchantRepo as never,
    productRepo as never,
    rescheduleRepo as never,
    notificationService as never,
    emailService as never,
    redis as never
  )

  return {
    service,
    campaignRepo,
    merchantRepo,
    productRepo,
    notificationService
  }
}

// ─── TC-02-01 ─────────────────────────────────────────────────────────────────

describe('TC-02-01: Tạo và nộp chiến dịch hợp lệ', () => {
  it('submit chiến dịch có sản phẩm → trạng thái APPROVED', async () => {
    const campaignRepo = makeCampaignRepo()
    const merchantRepo = makeMerchantRepo()
    const notificationService = makeNotificationService()

    merchantRepo.findByUserId.mockResolvedValue(makeMerchant())
    campaignRepo.findByIdAndMerchantWithProducts.mockResolvedValue(
      makeCampaign({ campaignProducts: [{ id: 'cp-id' }] })
    )
    campaignRepo.updateStatus.mockResolvedValue(
      makeCampaign({ status: CampaignStatus.APPROVED })
    )

    const { service } = buildService({
      campaignRepo,
      merchantRepo,
      notificationService
    })

    const result = await service.submit('user-id', 'campaign-id')

    expect(campaignRepo.updateStatus).toHaveBeenCalledWith(
      'campaign-id',
      CampaignStatus.APPROVED
    )
    expect(result).toMatchObject({ status: CampaignStatus.APPROVED })
    expect(notificationService.notifyAdmins).toHaveBeenCalledOnce()
  })

  it('tạo chiến dịch hợp lệ → lưu vào repo', async () => {
    const campaignRepo = makeCampaignRepo()
    const merchantRepo = makeMerchantRepo()

    merchantRepo.findByUserId.mockResolvedValue(makeMerchant())
    campaignRepo.findCommissionCategoryById.mockResolvedValue({
      id: 'cat-id',
      isActive: true,
      defaultRate: '0.1'
    })
    campaignRepo.create.mockResolvedValue(makeCampaign())

    const { service } = buildService({ campaignRepo, merchantRepo })

    const now = new Date()
    const startTime = new Date(now.getTime() + 2 * 60 * 60 * 1000) // 2 giờ sau
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000) // 1 giờ sau startTime

    const result = await service.create('user-id', {
      name: 'Flash Sale Test',
      description: 'Mô tả',
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      commissionCategoryId: 'cat-id'
    })

    expect(campaignRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 'merchant-id',
        name: 'Flash Sale Test'
      })
    )
    expect(result).toMatchObject({ id: 'campaign-id' })
  })
})

// ─── TC-02-02 ─────────────────────────────────────────────────────────────────

describe('TC-02-02: Nộp chiến dịch không có sản phẩm', () => {
  it('campaignProducts rỗng → ném BadRequestException', async () => {
    const campaignRepo = makeCampaignRepo()
    const merchantRepo = makeMerchantRepo()

    merchantRepo.findByUserId.mockResolvedValue(makeMerchant())
    campaignRepo.findByIdAndMerchantWithProducts.mockResolvedValue(
      makeCampaign({ campaignProducts: [] }) // không có sản phẩm
    )

    const { service } = buildService({ campaignRepo, merchantRepo })

    await expect(service.submit('user-id', 'campaign-id')).rejects.toThrow(
      BadRequestException
    )

    expect(campaignRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('chiến dịch không phải DRAFT → ném BadRequestException', async () => {
    const campaignRepo = makeCampaignRepo()
    const merchantRepo = makeMerchantRepo()

    merchantRepo.findByUserId.mockResolvedValue(makeMerchant())
    campaignRepo.findByIdAndMerchantWithProducts.mockResolvedValue(
      makeCampaign({
        status: CampaignStatus.ACTIVE,
        campaignProducts: [{ id: 'cp' }]
      })
    )

    const { service } = buildService({ campaignRepo, merchantRepo })

    await expect(service.submit('user-id', 'campaign-id')).rejects.toThrow(
      BadRequestException
    )
  })

  it('merchant chưa được duyệt → ném ForbiddenException', async () => {
    const merchantRepo = makeMerchantRepo()
    merchantRepo.findByUserId.mockResolvedValue(
      makeMerchant({ kycStatus: KycStatus.PENDING })
    )

    const { service } = buildService({ merchantRepo })

    await expect(service.submit('user-id', 'campaign-id')).rejects.toThrow(
      ForbiddenException
    )
  })
})

// ─── TC-02-03 ─────────────────────────────────────────────────────────────────

describe('TC-02-03: Thêm sản phẩm với giá flash ≥ giá gốc', () => {
  const setupAddProduct = () => {
    const campaignRepo = makeCampaignRepo()
    const merchantRepo = makeMerchantRepo()
    const productRepo = makeProductRepo()

    merchantRepo.findByUserId.mockResolvedValue(makeMerchant())
    campaignRepo.findByIdAndMerchant.mockResolvedValue(
      makeCampaign({ status: CampaignStatus.DRAFT })
    )

    return { campaignRepo, merchantRepo, productRepo }
  }

  it('salePrice = originalPrice → ném BadRequestException', async () => {
    const { campaignRepo, merchantRepo, productRepo } = setupAddProduct()
    productRepo.findByIdAndMerchant.mockResolvedValue(
      makeProduct({ originalPrice: 100_000 })
    )
    productRepo.getInventory.mockResolvedValue({ quantity: 50 })

    const { service } = buildService({
      campaignRepo,
      merchantRepo,
      productRepo
    })

    await expect(
      service.addProduct('user-id', 'campaign-id', {
        productId: 'product-id',
        salePrice: 100_000, // bằng giá gốc
        saleQuantity: 10,
        perUserLimit: 2
      })
    ).rejects.toThrow(BadRequestException)
  })

  it('salePrice > originalPrice → ném BadRequestException', async () => {
    const { campaignRepo, merchantRepo, productRepo } = setupAddProduct()
    productRepo.findByIdAndMerchant.mockResolvedValue(
      makeProduct({ originalPrice: 100_000 })
    )

    const { service } = buildService({
      campaignRepo,
      merchantRepo,
      productRepo
    })

    await expect(
      service.addProduct('user-id', 'campaign-id', {
        productId: 'product-id',
        salePrice: 120_000, // lớn hơn giá gốc
        saleQuantity: 10,
        perUserLimit: 2
      })
    ).rejects.toThrow(BadRequestException)
  })

  it('salePrice < originalPrice và đủ tồn kho → thêm thành công', async () => {
    const { campaignRepo, merchantRepo, productRepo } = setupAddProduct()
    productRepo.findByIdAndMerchant.mockResolvedValue(
      makeProduct({ originalPrice: 100_000 })
    )
    productRepo.getInventory.mockResolvedValue({ quantity: 50 })
    campaignRepo.addProduct.mockResolvedValue({
      id: 'cp-id',
      salePrice: 70_000
    })

    const { service } = buildService({
      campaignRepo,
      merchantRepo,
      productRepo
    })

    const result = await service.addProduct('user-id', 'campaign-id', {
      productId: 'product-id',
      salePrice: 70_000, // thấp hơn giá gốc
      saleQuantity: 10,
      perUserLimit: 2
    })

    expect(campaignRepo.addProduct).toHaveBeenCalledWith(
      expect.objectContaining({ salePrice: 70_000, saleQuantity: 10 })
    )
    expect(result).toMatchObject({ salePrice: 70_000 })
  })

  it('saleQuantity vượt tồn kho → ném BadRequestException', async () => {
    const { campaignRepo, merchantRepo, productRepo } = setupAddProduct()
    productRepo.findByIdAndMerchant.mockResolvedValue(
      makeProduct({ originalPrice: 100_000 })
    )
    productRepo.getInventory.mockResolvedValue({ quantity: 5 })

    const { service } = buildService({
      campaignRepo,
      merchantRepo,
      productRepo
    })

    await expect(
      service.addProduct('user-id', 'campaign-id', {
        productId: 'product-id',
        salePrice: 70_000,
        saleQuantity: 100, // vượt tồn kho 5
        perUserLimit: 2
      })
    ).rejects.toThrow(BadRequestException)
  })

  it('sản phẩm không thuộc merchant → ném NotFoundException', async () => {
    const { campaignRepo, merchantRepo, productRepo } = setupAddProduct()
    productRepo.findByIdAndMerchant.mockResolvedValue(null)

    const { service } = buildService({
      campaignRepo,
      merchantRepo,
      productRepo
    })

    await expect(
      service.addProduct('user-id', 'campaign-id', {
        productId: 'product-id',
        salePrice: 70_000,
        saleQuantity: 10,
        perUserLimit: 2
      })
    ).rejects.toThrow(NotFoundException)
  })
})

// ─── Helpers ───────────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toHaveBeenCalledOnce(): R
    }
  }
}

expect.extend({
  toHaveBeenCalledOnce(received: jest.Mock) {
    const pass = received.mock.calls.length === 1
    return {
      message: () =>
        `expected mock to have been called once, but was called ${received.mock.calls.length} times`,
      pass
    }
  }
})
