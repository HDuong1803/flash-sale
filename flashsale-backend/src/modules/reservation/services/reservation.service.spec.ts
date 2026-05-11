/**
 * TC-03 — Mua hàng và kiểm soát tồn kho
 * TC-05-01 — Phục hồi lỗi hệ thống (Redis key mất → fallback từ DB)
 *
 * TC-03-01: Mua hàng thành công → đặt chỗ HOLDING trong Redis + DB
 * TC-03-03: Mua vượt giới hạn mỗi người → từ chối 400
 * TC-05-01: Redis key mất → fallback từ DB để hoàn trả tồn kho
 */

import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ReservationStatus } from '@prisma/client'
import { ReservationService } from './reservation.service'

// ─── Mock factories ────────────────────────────────────────────────────────────

const makeReservationRepo = () => ({
  create: jest.fn().mockResolvedValue(undefined),
  findWithCampaignProductById: jest.fn(),
  findHoldingByCampaignProductIds: jest.fn().mockResolvedValue([]),
  updateStatus: jest.fn().mockResolvedValue(undefined),
  findActiveByCustomerId: jest.fn().mockResolvedValue([]),
  findDetailByIdForCustomer: jest.fn(),
  markAsPaid: jest.fn().mockResolvedValue(undefined)
})

const makeRedis = () => ({
  setReservation: jest.fn().mockResolvedValue(undefined),
  addReservationExpiry: jest.fn().mockResolvedValue(undefined),
  getReservation: jest.fn(),
  incrementStock: jest.fn().mockResolvedValue(undefined),
  decrementPurchaseCount: jest.fn().mockResolvedValue(undefined),
  deleteReservation: jest.fn().mockResolvedValue(undefined),
  removeReservationExpiry: jest.fn().mockResolvedValue(undefined),
  incrementMetricCounter: jest.fn().mockResolvedValue(undefined)
})

const buildService = (
  overrides: {
    reservationRepo?: ReturnType<typeof makeReservationRepo>
    redis?: ReturnType<typeof makeRedis>
  } = {}
) => {
  const reservationRepo = overrides.reservationRepo ?? makeReservationRepo()
  const redis = overrides.redis ?? makeRedis()

  const service = new ReservationService(
    reservationRepo as never,
    redis as never
  )

  return { service, reservationRepo, redis }
}

// ─── TC-03-01 ─────────────────────────────────────────────────────────────────

describe('TC-03-01: Tạo đặt chỗ thành công', () => {
  it('ghi vào Redis và DB, đặt TTL 600s', async () => {
    const { service, reservationRepo, redis } = buildService()

    const data = {
      id: 'resv-id',
      customerId: 'user-id',
      campaignProductId: 'cp-id',
      quantity: 1,
      idempotencyKey: 'key-abc'
    }

    await service.createReservation(data)

    // Step 1: Ghi vào Redis với TTL 600s
    expect(redis.setReservation).toHaveBeenCalledWith(
      'resv-id',
      expect.objectContaining({
        customerId: 'user-id',
        campaignProductId: 'cp-id',
        quantity: '1',
        status: ReservationStatus.HOLDING
      }),
      600
    )

    // Step 2: Đăng ký trong expiry sorted set
    expect(redis.addReservationExpiry).toHaveBeenCalledWith(
      'resv-id',
      expect.any(Number)
    )

    // Step 3: Ghi vào DB
    expect(reservationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'resv-id',
        customerId: 'user-id',
        campaignProductId: 'cp-id',
        quantity: 1,
        idempotencyKey: 'key-abc'
      })
    )
  })

  it('expiredAt phải nằm trong tương lai khoảng 600 giây', async () => {
    const { service, redis } = buildService()
    const before = Date.now()

    await service.createReservation({
      id: 'resv-id',
      customerId: 'user-id',
      campaignProductId: 'cp-id',
      quantity: 2,
      idempotencyKey: 'key-xyz'
    })

    const after = Date.now()
    const [, resvData] = redis.setReservation.mock.calls[0] as [
      string,
      { expiredAt: string },
      number
    ]
    const expiredAt = new Date(resvData.expiredAt).getTime()

    // expiredAt phải sau hiện tại ~600s (±5s tolerance)
    expect(expiredAt).toBeGreaterThanOrEqual(before + 595_000)
    expect(expiredAt).toBeLessThanOrEqual(after + 605_000)
  })
})

// ─── TC-03-03 ─────────────────────────────────────────────────────────────────

describe('TC-03-03: Huỷ đặt chỗ và kiểm tra quyền sở hữu', () => {
  it('huỷ đặt chỗ HOLDING của chính mình → gọi releaseReservation', async () => {
    const reservationRepo = makeReservationRepo()
    const redis = makeRedis()

    const reservation = {
      id: 'resv-id',
      customerId: 'user-id',
      status: 'HOLDING',
      campaignProduct: { id: 'cp-id' },
      quantity: 1
    }
    reservationRepo.findWithCampaignProductById.mockResolvedValue(reservation)
    redis.getReservation.mockResolvedValue({
      campaignProductId: 'cp-id',
      customerId: 'user-id',
      quantity: '1',
      status: 'HOLDING'
    })

    const { service } = buildService({ reservationRepo, redis })

    await service.cancelReservation('resv-id', 'user-id')

    expect(redis.incrementStock).toHaveBeenCalledWith('cp-id', 1)
    expect(redis.deleteReservation).toHaveBeenCalledWith('resv-id')
    expect(reservationRepo.updateStatus).toHaveBeenCalledWith(
      'resv-id',
      ReservationStatus.EXPIRED,
      'USER_CANCELLED'
    )
  })

  it('huỷ đặt chỗ của người khác → ném NotFoundException', async () => {
    const reservationRepo = makeReservationRepo()

    const reservation = {
      id: 'resv-id',
      customerId: 'other-user',
      status: 'HOLDING',
      campaignProduct: { id: 'cp-id' },
      quantity: 1
    }
    reservationRepo.findWithCampaignProductById.mockResolvedValue(reservation)

    const { service } = buildService({ reservationRepo })

    await expect(
      service.cancelReservation('resv-id', 'current-user') // không phải owner
    ).rejects.toThrow(NotFoundException)
  })

  it('đặt chỗ không ở trạng thái HOLDING → ném BadRequestException', async () => {
    const reservationRepo = makeReservationRepo()

    const reservation = {
      id: 'resv-id',
      customerId: 'user-id',
      status: 'PAID',
      campaignProduct: { id: 'cp-id' },
      quantity: 1
    }
    reservationRepo.findWithCampaignProductById.mockResolvedValue(reservation)

    const { service } = buildService({ reservationRepo })

    await expect(
      service.cancelReservation('resv-id', 'user-id')
    ).rejects.toThrow(BadRequestException)
  })

  it('đặt chỗ không tồn tại → ném NotFoundException', async () => {
    const reservationRepo = makeReservationRepo()
    reservationRepo.findWithCampaignProductById.mockResolvedValue(null)

    const { service } = buildService({ reservationRepo })

    await expect(
      service.cancelReservation('ghost-resv', 'user-id')
    ).rejects.toThrow(NotFoundException)
  })
})

// ─── TC-04-01 / TC-05-01 ─────────────────────────────────────────────────────

describe('TC-04-01 / TC-05-01: Giải phóng đặt chỗ và phục hồi từ DB khi Redis mất key', () => {
  it('TC-04-01: Redis có key → hoàn trả tồn kho + decrement purchase count + xóa key', async () => {
    const reservationRepo = makeReservationRepo()
    const redis = makeRedis()

    redis.getReservation.mockResolvedValue({
      campaignProductId: 'cp-id',
      customerId: 'user-id',
      quantity: '2',
      status: 'HOLDING'
    })

    const { service } = buildService({ reservationRepo, redis })

    await service.releaseReservation('resv-id', 'TTL_EXPIRED')

    // Hoàn trả tồn kho
    expect(redis.incrementStock).toHaveBeenCalledWith('cp-id', 2)

    // Decrement purchase counter để user có thể mua lại
    expect(redis.decrementPurchaseCount).toHaveBeenCalledWith(
      'cp-id',
      'user-id',
      2
    )

    // Xóa Redis key
    expect(redis.deleteReservation).toHaveBeenCalledWith('resv-id')

    // Cập nhật trạng thái DB → EXPIRED
    expect(reservationRepo.updateStatus).toHaveBeenCalledWith(
      'resv-id',
      ReservationStatus.EXPIRED,
      'TTL_EXPIRED'
    )
  })

  it('TC-05-01: Redis key mất (evicted/expired) → fallback từ DB để hoàn trả tồn kho', async () => {
    const reservationRepo = makeReservationRepo()
    const redis = makeRedis()

    // Redis không có key
    redis.getReservation.mockResolvedValue(null)

    // DB có bản ghi với status HOLDING
    reservationRepo.findWithCampaignProductById.mockResolvedValue({
      id: 'resv-id',
      status: ReservationStatus.HOLDING,
      customerId: 'user-id',
      quantity: 3,
      campaignProduct: {
        id: 'cp-id'
      }
    })

    const { service } = buildService({ reservationRepo, redis })

    await service.releaseReservation('resv-id', 'TTL_EXPIRED')

    // Phải hoàn trả tồn kho dựa trên dữ liệu từ DB (fallback)
    expect(redis.incrementStock).toHaveBeenCalledWith('cp-id', 3)
    expect(redis.decrementPurchaseCount).toHaveBeenCalledWith(
      'cp-id',
      'user-id',
      3
    )

    // Vẫn cập nhật DB record → EXPIRED
    expect(reservationRepo.updateStatus).toHaveBeenCalledWith(
      'resv-id',
      ReservationStatus.EXPIRED,
      'TTL_EXPIRED'
    )
  })

  it('Redis key mất và DB không có bản ghi HOLDING → không hoàn trả tồn kho', async () => {
    const reservationRepo = makeReservationRepo()
    const redis = makeRedis()

    redis.getReservation.mockResolvedValue(null)
    // DB cũng không tìm thấy HOLDING record
    reservationRepo.findWithCampaignProductById.mockResolvedValue({
      id: 'resv-id',
      status: ReservationStatus.PAID, // đã thanh toán, không cần hoàn trả
      customerId: 'user-id',
      quantity: 1,
      campaignProduct: { id: 'cp-id' }
    })

    const { service } = buildService({ reservationRepo, redis })

    await service.releaseReservation('resv-id', 'TTL_EXPIRED')

    // Không hoàn trả vì status không phải HOLDING
    expect(redis.incrementStock).not.toHaveBeenCalled()
    expect(redis.decrementPurchaseCount).not.toHaveBeenCalled()
  })

  it('lý do EXPIRE → tăng metric counter', async () => {
    const reservationRepo = makeReservationRepo()
    const redis = makeRedis()

    redis.getReservation.mockResolvedValue({
      campaignProductId: 'cp-id',
      customerId: 'user-id',
      quantity: '1',
      status: 'HOLDING'
    })

    const { service } = buildService({ reservationRepo, redis })

    await service.releaseReservation('resv-id', 'TTL_EXPIRED')

    expect(redis.incrementMetricCounter).toHaveBeenCalledWith(
      'reservation_expire_rate'
    )
  })

  it('lý do USER_CANCELLED → không tăng expire metric', async () => {
    const reservationRepo = makeReservationRepo()
    const redis = makeRedis()

    redis.getReservation.mockResolvedValue({
      campaignProductId: 'cp-id',
      customerId: 'user-id',
      quantity: '1',
      status: 'HOLDING'
    })

    const { service } = buildService({ reservationRepo, redis })

    await service.releaseReservation('resv-id', 'USER_CANCELLED')

    expect(redis.incrementMetricCounter).not.toHaveBeenCalled()
  })
})

// ─── markAsPaid ───────────────────────────────────────────────────────────────

describe('markAsPaid: Đánh dấu thanh toán thành công', () => {
  it('xóa Redis key + expiry set + cập nhật DB → PAID', async () => {
    const reservationRepo = makeReservationRepo()
    const redis = makeRedis()

    const { service } = buildService({ reservationRepo, redis })

    await service.markAsPaid('resv-id')

    expect(redis.deleteReservation).toHaveBeenCalledWith('resv-id')
    expect(redis.removeReservationExpiry).toHaveBeenCalledWith('resv-id')
    expect(reservationRepo.markAsPaid).toHaveBeenCalledWith('resv-id')
  })
})

// ─── releaseAllHoldingForCampaign ─────────────────────────────────────────────

describe('releaseAllHoldingForCampaign: Giải phóng khi force stop campaign', () => {
  it('giải phóng tất cả HOLDING reservations của campaign', async () => {
    const reservationRepo = makeReservationRepo()
    const redis = makeRedis()

    reservationRepo.findHoldingByCampaignProductIds.mockResolvedValue([
      {
        id: 'resv-1',
        customerId: 'u1',
        campaignProduct: { id: 'cp-1' },
        quantity: 1
      },
      {
        id: 'resv-2',
        customerId: 'u2',
        campaignProduct: { id: 'cp-1' },
        quantity: 2
      }
    ])
    redis.getReservation.mockResolvedValue({
      campaignProductId: 'cp-1',
      customerId: 'u1',
      quantity: '1',
      status: 'HOLDING'
    })

    const { service } = buildService({ reservationRepo, redis })

    await service.releaseAllHoldingForCampaign(['cp-1'])

    expect(reservationRepo.updateStatus).toHaveBeenCalledTimes(2)
  })

  it('danh sách rỗng → không làm gì', async () => {
    const reservationRepo = makeReservationRepo()
    const redis = makeRedis()

    const { service } = buildService({ reservationRepo, redis })

    await service.releaseAllHoldingForCampaign([])

    expect(
      reservationRepo.findHoldingByCampaignProductIds
    ).not.toHaveBeenCalled()
  })
})
