/**
 * TC-04 — Đặt chỗ và thanh toán
 *
 * TC-04-02: Thanh toán thành công qua Stripe webhook → order tạo, đặt chỗ → PAID
 * TC-04-03: Stripe gửi webhook trùng lặp → lần 2 bị bỏ qua, không tạo order thứ hai
 * TC-04-04: Saga thất bại tại bước tạo đơn hàng → rollback: tồn kho hoàn trả
 * TC-04-05: Checkout khi đặt chỗ hết hạn → từ chối với BadRequestException
 */

import { BadRequestException, NotFoundException } from '@nestjs/common'
import { PaymentStatus, NotificationType } from '@prisma/client'
import {
  SagaCoordinatorService,
  CheckoutDataExpiredException
} from './saga-coordinator.service'

// ─── Mock factories ────────────────────────────────────────────────────────────

const makePaymentRepo = () => ({
  findById: jest.fn(),
  claimPaymentForProcessing: jest.fn().mockResolvedValue(true),
  findReservationWithProduct: jest.fn(),
  createOrderWithItems: jest.fn(),
  updatePaymentSuccess: jest.fn().mockResolvedValue(undefined),
  updatePaymentFailed: jest.fn().mockResolvedValue(undefined),
  updateReservationShippingAddress: jest.fn().mockResolvedValue(undefined)
})

const makeRedis = () => ({
  client: {
    get: jest.fn().mockResolvedValue(null)
  },
  publishDashboardEvent: jest.fn().mockResolvedValue(undefined)
})

const makeReservationService = () => ({
  markAsPaid: jest.fn().mockResolvedValue(undefined),
  releaseReservation: jest.fn().mockResolvedValue(undefined)
})

const makeNotificationService = () => ({
  createNotification: jest.fn().mockResolvedValue(undefined)
})

const makeFulfillmentService = () => ({
  initializeFulfillment: jest.fn().mockResolvedValue(undefined)
})

const makeReservation = (overrides: Record<string, unknown> = {}) => ({
  id: 'resv-id',
  customerId: 'customer-id',
  shippingAddress: '123 Nguyễn Huệ, Q1, TP.HCM',
  quantity: 1,
  campaignProduct: {
    id: 'cp-id',
    productId: 'product-id',
    salePrice: '500000',
    campaignId: 'campaign-id',
    campaign: {
      id: 'campaign-id',
      name: 'Flash Sale Test',
      commissionRate: '0.1',
      commissionCategoryId: 'cat-id',
      merchant: {
        stripeAccountId: null,
        stripeAccountStatus: null,
        stripeChargesEnabled: false
      }
    },
    product: {
      merchantId: 'merchant-id',
      originalPrice: '1000000'
    }
  },
  ...overrides
})

const makeOrder = () => ({
  id: 'order-id',
  totalAmount: 500_000,
  campaignId: 'campaign-id'
})

const buildService = (
  overrides: {
    paymentRepo?: ReturnType<typeof makePaymentRepo>
    redis?: ReturnType<typeof makeRedis>
    reservationService?: ReturnType<typeof makeReservationService>
    notificationService?: ReturnType<typeof makeNotificationService>
    fulfillmentService?: ReturnType<typeof makeFulfillmentService> | null
  } = {}
) => {
  const paymentRepo = overrides.paymentRepo ?? makePaymentRepo()
  const redis = overrides.redis ?? makeRedis()
  const reservationService =
    overrides.reservationService ?? makeReservationService()
  const notificationService =
    overrides.notificationService ?? makeNotificationService()
  const fulfillmentService =
    overrides.fulfillmentService !== undefined
      ? overrides.fulfillmentService
      : makeFulfillmentService()

  const service = new SagaCoordinatorService(
    paymentRepo as never,
    redis as never,
    reservationService as never,
    notificationService as never,
    fulfillmentService as never
  )

  return {
    service,
    paymentRepo,
    redis,
    reservationService,
    notificationService
  }
}

// ─── TC-04-02 ─────────────────────────────────────────────────────────────────

describe('TC-04-02: Thanh toán thành công qua Stripe webhook', () => {
  it('tạo order, đánh dấu PAID, gửi thông báo, publish dashboard event', async () => {
    const paymentRepo = makePaymentRepo()
    const reservationService = makeReservationService()
    const notificationService = makeNotificationService()
    const redis = makeRedis()

    paymentRepo.findById.mockResolvedValue({
      id: 'pay-id',
      status: PaymentStatus.PENDING,
      reservationId: 'resv-id'
    })
    paymentRepo.claimPaymentForProcessing.mockResolvedValue(true)
    paymentRepo.findReservationWithProduct.mockResolvedValue(makeReservation())
    paymentRepo.createOrderWithItems.mockResolvedValue(makeOrder())

    const { service } = buildService({
      paymentRepo,
      reservationService,
      notificationService,
      redis
    })

    await service.confirmPayment('pay-id', 'stripe-tx-id')

    // Order phải được tạo
    expect(paymentRepo.createOrderWithItems).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'customer-id',
        merchantId: 'merchant-id',
        reservationId: 'resv-id',
        paymentId: 'pay-id'
      })
    )

    // Payment phải được đánh dấu SUCCESS
    expect(paymentRepo.updatePaymentSuccess).toHaveBeenCalledWith(
      'pay-id',
      'stripe-tx-id'
    )

    // Reservation phải được đánh dấu PAID
    expect(reservationService.markAsPaid).toHaveBeenCalledWith('resv-id')

    // Thông báo cho khách hàng
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      'customer-id',
      expect.objectContaining({ type: NotificationType.ORDER_CONFIRMED })
    )

    // Publish real-time event
    expect(redis.publishDashboardEvent).toHaveBeenCalledWith(
      'campaign-id',
      expect.objectContaining({ type: 'ORDER_CONFIRMED' })
    )
  })
})

// ─── TC-04-03 ─────────────────────────────────────────────────────────────────

describe('TC-04-03: Stripe gửi webhook trùng lặp', () => {
  it('payment đã SUCCESS → bỏ qua, không tạo order thứ hai', async () => {
    const paymentRepo = makePaymentRepo()

    paymentRepo.findById.mockResolvedValue({
      id: 'pay-id',
      status: PaymentStatus.SUCCESS,
      reservationId: 'resv-id'
    })

    const { service } = buildService({ paymentRepo })

    await service.confirmPayment('pay-id', 'stripe-tx-id')

    // Không được tạo order thêm
    expect(paymentRepo.createOrderWithItems).not.toHaveBeenCalled()
    expect(paymentRepo.updatePaymentSuccess).not.toHaveBeenCalled()
  })

  it('payment đã FAILED → bỏ qua', async () => {
    const paymentRepo = makePaymentRepo()

    paymentRepo.findById.mockResolvedValue({
      id: 'pay-id',
      status: PaymentStatus.FAILED,
      reservationId: 'resv-id'
    })

    const { service } = buildService({ paymentRepo })

    await service.confirmPayment('pay-id', 'stripe-tx-id')

    expect(paymentRepo.createOrderWithItems).not.toHaveBeenCalled()
  })

  it('payment đang PROCESSING và đã bị worker khác claim → bỏ qua', async () => {
    const paymentRepo = makePaymentRepo()

    paymentRepo.findById.mockResolvedValue({
      id: 'pay-id',
      status: PaymentStatus.PENDING,
      reservationId: 'resv-id'
    })
    paymentRepo.claimPaymentForProcessing.mockResolvedValue(false) // đã bị claim

    const { service } = buildService({ paymentRepo })

    await service.confirmPayment('pay-id', 'stripe-tx-id')

    expect(paymentRepo.createOrderWithItems).not.toHaveBeenCalled()
  })
})

// ─── TC-04-04 ─────────────────────────────────────────────────────────────────

describe('TC-04-04: Saga thất bại tại bước tạo đơn hàng → rollback', () => {
  it('createOrderWithItems ném lỗi → rollback: payment FAILED + hoàn trả tồn kho', async () => {
    const paymentRepo = makePaymentRepo()
    const reservationService = makeReservationService()
    const notificationService = makeNotificationService()

    paymentRepo.findById.mockResolvedValue({
      id: 'pay-id',
      status: PaymentStatus.PENDING,
      reservationId: 'resv-id'
    })
    paymentRepo.claimPaymentForProcessing.mockResolvedValue(true)
    paymentRepo.findReservationWithProduct.mockResolvedValue(makeReservation())

    // Mô phỏng lỗi DB khi tạo order
    paymentRepo.createOrderWithItems.mockRejectedValue(
      new Error('DB connection timeout')
    )

    const { service } = buildService({
      paymentRepo,
      reservationService,
      notificationService
    })

    await expect(
      service.confirmPayment('pay-id', 'stripe-tx-id')
    ).rejects.toThrow('DB connection timeout')

    // Rollback: payment phải được đánh dấu FAILED
    expect(paymentRepo.updatePaymentFailed).toHaveBeenCalledWith('pay-id')

    // Rollback: tồn kho phải được hoàn trả
    expect(reservationService.releaseReservation).toHaveBeenCalledWith(
      'resv-id',
      'PAYMENT_FAILED'
    )

    // Thông báo cho khách về thanh toán thất bại
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      'customer-id',
      expect.objectContaining({ type: NotificationType.PAYMENT_FAILED })
    )

    // Payment KHÔNG được đánh dấu SUCCESS
    expect(paymentRepo.updatePaymentSuccess).not.toHaveBeenCalled()
  })

  it('payment không tồn tại → ném NotFoundException', async () => {
    const paymentRepo = makePaymentRepo()
    paymentRepo.findById.mockResolvedValue(null)

    const { service } = buildService({ paymentRepo })

    await expect(
      service.confirmPayment('nonexistent-pay', 'stripe-tx-id')
    ).rejects.toThrow(NotFoundException)
  })
})

// ─── TC-04-05 ─────────────────────────────────────────────────────────────────

describe('TC-04-05: Checkout khi đặt chỗ hết hạn → dữ liệu checkout bị mất', () => {
  it('shippingAddress vừa mất trong Redis và DB → ném CheckoutDataExpiredException', async () => {
    const paymentRepo = makePaymentRepo()
    const redis = makeRedis()

    paymentRepo.findById.mockResolvedValue({
      id: 'pay-id',
      status: PaymentStatus.PENDING,
      reservationId: 'resv-id'
    })
    paymentRepo.claimPaymentForProcessing.mockResolvedValue(true)
    paymentRepo.findReservationWithProduct.mockResolvedValue(
      makeReservation({ shippingAddress: '' }) // DB không có địa chỉ
    )

    // Redis cũng không có fallback
    redis.client.get.mockResolvedValue(null)

    const { service } = buildService({ paymentRepo, redis })

    await expect(
      service.confirmPayment('pay-id', 'stripe-tx-id')
    ).rejects.toThrow(CheckoutDataExpiredException)

    // Payment KHÔNG được đánh dấu FAILED trong trường hợp này
    // (tiền đã nhận nhưng thiếu địa chỉ → cần xử lý thủ công)
    expect(paymentRepo.updatePaymentFailed).not.toHaveBeenCalled()
    expect(paymentRepo.createOrderWithItems).not.toHaveBeenCalled()
  })

  it('payment không có reservationId → ném BadRequestException', async () => {
    const paymentRepo = makePaymentRepo()

    paymentRepo.findById.mockResolvedValue({
      id: 'pay-id',
      status: PaymentStatus.PENDING,
      reservationId: null // không có reservation
    })
    paymentRepo.claimPaymentForProcessing.mockResolvedValue(true)

    const { service } = buildService({ paymentRepo })

    await expect(
      service.confirmPayment('pay-id', 'stripe-tx-id')
    ).rejects.toThrow(BadRequestException)
  })

  it('shippingAddress có trong DB → tiến hành saga bình thường', async () => {
    const paymentRepo = makePaymentRepo()

    paymentRepo.findById.mockResolvedValue({
      id: 'pay-id',
      status: PaymentStatus.PENDING,
      reservationId: 'resv-id'
    })
    paymentRepo.claimPaymentForProcessing.mockResolvedValue(true)
    paymentRepo.findReservationWithProduct.mockResolvedValue(
      makeReservation({ shippingAddress: '456 Lê Lợi, Q1' })
    )
    paymentRepo.createOrderWithItems.mockResolvedValue(makeOrder())

    const { service } = buildService({ paymentRepo })

    await service.confirmPayment('pay-id', 'stripe-tx-id')

    expect(paymentRepo.createOrderWithItems).toHaveBeenCalledOnce()
    expect(paymentRepo.updatePaymentSuccess).toHaveBeenCalledWith(
      'pay-id',
      'stripe-tx-id'
    )
  })

  it('shippingAddress mất trong DB nhưng có trong Redis fallback → tiếp tục saga', async () => {
    const paymentRepo = makePaymentRepo()
    const redis = makeRedis()

    paymentRepo.findById.mockResolvedValue({
      id: 'pay-id',
      status: PaymentStatus.PENDING,
      reservationId: 'resv-id'
    })
    paymentRepo.claimPaymentForProcessing.mockResolvedValue(true)
    paymentRepo.findReservationWithProduct.mockResolvedValue(
      makeReservation({ shippingAddress: '' }) // DB không có
    )
    paymentRepo.createOrderWithItems.mockResolvedValue(makeOrder())

    // Redis có fallback
    redis.client.get.mockResolvedValue(
      JSON.stringify({ shippingAddress: '789 Trần Hưng Đạo, Q5' })
    )

    const { service } = buildService({ paymentRepo, redis })

    await service.confirmPayment('pay-id', 'stripe-tx-id')

    // Phải đồng bộ địa chỉ vào DB
    expect(paymentRepo.updateReservationShippingAddress).toHaveBeenCalledWith(
      'resv-id',
      '789 Trần Hưng Đạo, Q5'
    )
    expect(paymentRepo.createOrderWithItems).toHaveBeenCalledOnce()
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
