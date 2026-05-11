/**
 * TC-05 — Phục hồi lỗi hệ thống
 *
 * TC-05-02: OrderWorker thất bại 3 lần → vào Dead Letter Queue, tồn kho hoàn trả
 *           (logic payment recovery — payment bị kẹt PROCESSING → retry saga)
 * TC-05-03: Payment bị kẹt PROCESSING > 10 phút → recovery job tự động retry Saga
 */

import { PaymentRecoveryService } from './payment-recovery.service'
import { CheckoutDataExpiredException } from './saga-coordinator.service'

jest.mock('@sentry/nestjs', () => ({
  captureMessage: jest.fn()
}))

import * as Sentry from '@sentry/nestjs'

// ─── Mock factories ────────────────────────────────────────────────────────────

const makePaymentRepo = () => ({
  findStuckProcessingPayments: jest.fn().mockResolvedValue([]),
  markWebhookLogProcessed: jest.fn().mockResolvedValue(undefined)
})

const makeSaga = () => ({
  confirmPayment: jest.fn().mockResolvedValue(undefined)
})

const makeRedis = () => ({
  incrementMetricCounter: jest.fn().mockResolvedValue(undefined)
})

const makeStuckPayment = (overrides: Record<string, unknown> = {}) => ({
  id: 'pay-id',
  reservationId: 'resv-id',
  amount: '500000',
  updatedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 phút trước
  webhookLogs: [
    {
      id: 'log-id',
      transactionId: 'stripe-tx-abc'
    }
  ],
  ...overrides
})

const buildService = (
  overrides: {
    paymentRepo?: ReturnType<typeof makePaymentRepo>
    saga?: ReturnType<typeof makeSaga>
    redis?: ReturnType<typeof makeRedis>
  } = {}
) => {
  const paymentRepo = overrides.paymentRepo ?? makePaymentRepo()
  const saga = overrides.saga ?? makeSaga()
  const redis = overrides.redis ?? makeRedis()

  const service = new PaymentRecoveryService(
    paymentRepo as never,
    saga as never,
    redis as never
  )

  return { service, paymentRepo, saga, redis }
}

// ─── TC-05-03 ─────────────────────────────────────────────────────────────────

describe('TC-05-03: Payment bị kẹt PROCESSING > 10 phút → recovery job retry Saga', () => {
  it('retry saga thành công → markWebhookLogProcessed + tăng metric', async () => {
    const paymentRepo = makePaymentRepo()
    const saga = makeSaga()
    const redis = makeRedis()

    paymentRepo.findStuckProcessingPayments.mockResolvedValue([
      makeStuckPayment()
    ])
    saga.confirmPayment.mockResolvedValue(undefined)

    const { service } = buildService({ paymentRepo, saga, redis })

    await service.recoverStuckPayments()

    // Saga được thử lại với transactionId từ webhook log
    expect(saga.confirmPayment).toHaveBeenCalledWith('pay-id', 'stripe-tx-abc')

    // Webhook log đánh dấu đã xử lý
    expect(paymentRepo.markWebhookLogProcessed).toHaveBeenCalledWith('log-id')

    // Metric tăng
    expect(redis.incrementMetricCounter).toHaveBeenCalledWith(
      'recovery_success_rate'
    )
  })

  it('không có payment bị kẹt → kết thúc sớm, không gọi saga', async () => {
    const paymentRepo = makePaymentRepo()
    const saga = makeSaga()

    paymentRepo.findStuckProcessingPayments.mockResolvedValue([])

    const { service } = buildService({ paymentRepo, saga })

    await service.recoverStuckPayments()

    expect(saga.confirmPayment).not.toHaveBeenCalled()
    expect(paymentRepo.markWebhookLogProcessed).not.toHaveBeenCalled()
  })

  it('payment bị kẹt quá 60 phút → log CRITICAL + Sentry alert, không retry', async () => {
    const paymentRepo = makePaymentRepo()
    const saga = makeSaga()

    const criticalPayment = makeStuckPayment({
      updatedAt: new Date(Date.now() - 65 * 60 * 1000) // 65 phút trước
    })
    paymentRepo.findStuckProcessingPayments.mockResolvedValue([criticalPayment])

    const { service } = buildService({ paymentRepo, saga })

    await service.recoverStuckPayments()

    // Không retry saga — chỉ alert
    expect(saga.confirmPayment).not.toHaveBeenCalled()

    // Phải gửi Sentry alert
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('pay-id'),
      expect.objectContaining({ level: 'error' })
    )
  })

  it('payment không có transactionId → bỏ qua, không retry', async () => {
    const paymentRepo = makePaymentRepo()
    const saga = makeSaga()

    const paymentWithoutTxId = makeStuckPayment({
      webhookLogs: [{ id: 'log-no-tx', transactionId: null }]
    })
    paymentRepo.findStuckProcessingPayments.mockResolvedValue([
      paymentWithoutTxId
    ])

    const { service } = buildService({ paymentRepo, saga })

    await service.recoverStuckPayments()

    expect(saga.confirmPayment).not.toHaveBeenCalled()
  })

  it('payment không có webhookLogs → bỏ qua', async () => {
    const paymentRepo = makePaymentRepo()
    const saga = makeSaga()

    const paymentWithoutLogs = makeStuckPayment({ webhookLogs: [] })
    paymentRepo.findStuckProcessingPayments.mockResolvedValue([
      paymentWithoutLogs
    ])

    const { service } = buildService({ paymentRepo, saga })

    await service.recoverStuckPayments()

    expect(saga.confirmPayment).not.toHaveBeenCalled()
  })

  it('saga ném CheckoutDataExpiredException → log CRITICAL + Sentry, không throw', async () => {
    const paymentRepo = makePaymentRepo()
    const saga = makeSaga()

    paymentRepo.findStuckProcessingPayments.mockResolvedValue([
      makeStuckPayment()
    ])
    saga.confirmPayment.mockRejectedValue(
      new CheckoutDataExpiredException('pay-id', 'resv-id')
    )

    const { service } = buildService({ paymentRepo, saga })

    // Không được throw — job phải tiếp tục xử lý payment tiếp theo
    await expect(service.recoverStuckPayments()).resolves.not.toThrow()

    // Sentry alert vì checkout data expired
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('checkout data expired'),
      expect.objectContaining({ level: 'error' })
    )
  })

  it('saga ném lỗi thông thường → log warning, sẽ retry lần sau, không throw', async () => {
    const paymentRepo = makePaymentRepo()
    const saga = makeSaga()

    paymentRepo.findStuckProcessingPayments.mockResolvedValue([
      makeStuckPayment()
    ])
    saga.confirmPayment.mockRejectedValue(new Error('DB timeout'))

    const { service } = buildService({ paymentRepo, saga })

    // Không throw — job phải bền vững
    await expect(service.recoverStuckPayments()).resolves.not.toThrow()

    // Không đánh dấu webhook log đã xử lý vì saga thất bại
    expect(paymentRepo.markWebhookLogProcessed).not.toHaveBeenCalled()
  })

  it('TC-05-02: nhiều payment bị kẹt → xử lý tuần tự tất cả', async () => {
    const paymentRepo = makePaymentRepo()
    const saga = makeSaga()
    const redis = makeRedis()

    const stuckPayments = [
      makeStuckPayment({
        id: 'pay-1',
        webhookLogs: [{ id: 'log-1', transactionId: 'tx-1' }]
      }),
      makeStuckPayment({
        id: 'pay-2',
        webhookLogs: [{ id: 'log-2', transactionId: 'tx-2' }]
      }),
      makeStuckPayment({
        id: 'pay-3',
        webhookLogs: [{ id: 'log-3', transactionId: 'tx-3' }]
      })
    ]

    paymentRepo.findStuckProcessingPayments.mockResolvedValue(stuckPayments)

    // Tăng metric counter cho tổng số bị kẹt
    const { service } = buildService({ paymentRepo, saga, redis })

    await service.recoverStuckPayments()

    // Phải tăng metric với tổng số 3 payment
    expect(redis.incrementMetricCounter).toHaveBeenCalledWith(
      'payment_stuck_count',
      3
    )

    // Tất cả 3 saga đều được retry
    expect(saga.confirmPayment).toHaveBeenCalledTimes(3)
    expect(saga.confirmPayment).toHaveBeenCalledWith('pay-1', 'tx-1')
    expect(saga.confirmPayment).toHaveBeenCalledWith('pay-2', 'tx-2')
    expect(saga.confirmPayment).toHaveBeenCalledWith('pay-3', 'tx-3')
  })
})
