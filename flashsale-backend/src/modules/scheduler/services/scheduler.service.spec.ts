/**
 * TC-02 (phần 2) — Vòng đời chiến dịch Flash Sale (Scheduler)
 *
 * TC-02-04: Scheduler kích hoạt chiến dịch đúng giờ → tồn kho nạp vào Redis, trạng thái → ACTIVE
 * TC-02-05: Admin force-stop chiến dịch đang chạy → tồn kho đồng bộ về DB, trạng thái → ENDED
 */

import { CampaignStatus } from '@prisma/client'
import { SchedulerService } from './scheduler.service'

// ─── Mock factories ────────────────────────────────────────────────────────────

const makeSchedulerRepo = () => ({
  findCampaignsToActivate: jest.fn(),
  findCampaignsToClose: jest.fn(),
  findCampaignsForReminders: jest.fn(),
  findActiveCampaignProducts: jest.fn(),
  updateCampaignStatus: jest.fn().mockResolvedValue(undefined),
  updateCampaignProductRemaining: jest.fn().mockResolvedValue(undefined),
  markReminderSent: jest.fn().mockResolvedValue(undefined)
})

const makeRedis = () => ({
  acquireLockToken: jest.fn().mockResolvedValue('lock-token'),
  releaseLockToken: jest.fn().mockResolvedValue(undefined),
  initStock: jest.fn().mockResolvedValue(undefined),
  loadWhitelist: jest.fn().mockResolvedValue(undefined),
  getExpiredReservations: jest.fn().mockResolvedValue([]),
  getStock: jest.fn().mockResolvedValue(null)
})

const makeReservationService = () => ({
  releaseReservation: jest.fn().mockResolvedValue(undefined)
})

const makeNotificationService = () => ({
  createNotification: jest.fn().mockResolvedValue(undefined)
})

const makePaymentRecovery = () => ({
  recoverStuckPayments: jest.fn().mockResolvedValue(undefined)
})

const buildService = (
  overrides: {
    schedulerRepo?: ReturnType<typeof makeSchedulerRepo>
    redis?: ReturnType<typeof makeRedis>
    reservationService?: ReturnType<typeof makeReservationService>
    notificationService?: ReturnType<typeof makeNotificationService>
    paymentRecovery?: ReturnType<typeof makePaymentRecovery>
  } = {}
) => {
  const schedulerRepo = overrides.schedulerRepo ?? makeSchedulerRepo()
  const redis = overrides.redis ?? makeRedis()
  const reservationService =
    overrides.reservationService ?? makeReservationService()
  const notificationService =
    overrides.notificationService ?? makeNotificationService()
  const paymentRecovery = overrides.paymentRecovery ?? makePaymentRecovery()

  const service = new SchedulerService(
    schedulerRepo as never,
    redis as never,
    reservationService as never,
    notificationService as never,
    paymentRecovery as never
  )

  return { service, schedulerRepo, redis, reservationService }
}

// ─── TC-02-04 ─────────────────────────────────────────────────────────────────

describe('TC-02-04: Scheduler kích hoạt chiến dịch đúng giờ', () => {
  it('nạp tồn kho vào Redis và cập nhật trạng thái → ACTIVE', async () => {
    const schedulerRepo = makeSchedulerRepo()
    const redis = makeRedis()

    const campaign = {
      id: 'campaign-id',
      name: 'Flash Sale Test',
      campaignProducts: [
        { id: 'cp-1', saleQuantity: 50 },
        { id: 'cp-2', saleQuantity: 100 }
      ],
      preRegistrations: []
    }
    schedulerRepo.findCampaignsToActivate.mockResolvedValue([campaign])

    const { service } = buildService({ schedulerRepo, redis })

    await service.activateCampaigns()

    // Tồn kho phải được nạp vào Redis cho từng sản phẩm
    expect(redis.initStock).toHaveBeenCalledWith('cp-1', 50)
    expect(redis.initStock).toHaveBeenCalledWith('cp-2', 100)

    // Trạng thái chiến dịch phải được cập nhật → ACTIVE
    expect(schedulerRepo.updateCampaignStatus).toHaveBeenCalledWith(
      'campaign-id',
      CampaignStatus.ACTIVE
    )
  })

  it('chiến dịch có pre-registration → load whitelist vào Redis', async () => {
    const schedulerRepo = makeSchedulerRepo()
    const redis = makeRedis()

    const campaign = {
      id: 'campaign-id',
      name: 'VIP Flash Sale',
      campaignProducts: [{ id: 'cp-1', saleQuantity: 50 }],
      preRegistrations: [
        { customerId: 'user-1' },
        { customerId: 'user-2' },
        { customerId: 'user-3' }
      ]
    }
    schedulerRepo.findCampaignsToActivate.mockResolvedValue([campaign])

    const { service } = buildService({ schedulerRepo, redis })

    await service.activateCampaigns()

    expect(redis.loadWhitelist).toHaveBeenCalledWith('campaign-id', [
      'user-1',
      'user-2',
      'user-3'
    ])
  })

  it('chiến dịch không có pre-registration → không gọi loadWhitelist', async () => {
    const schedulerRepo = makeSchedulerRepo()
    const redis = makeRedis()

    const campaign = {
      id: 'campaign-id',
      name: 'Open Flash Sale',
      campaignProducts: [{ id: 'cp-1', saleQuantity: 50 }],
      preRegistrations: []
    }
    schedulerRepo.findCampaignsToActivate.mockResolvedValue([campaign])

    const { service } = buildService({ schedulerRepo, redis })

    await service.activateCampaigns()

    expect(redis.loadWhitelist).not.toHaveBeenCalled()
    expect(schedulerRepo.updateCampaignStatus).toHaveBeenCalledWith(
      'campaign-id',
      CampaignStatus.ACTIVE
    )
  })

  it('không có chiến dịch cần kích hoạt → không gọi initStock', async () => {
    const schedulerRepo = makeSchedulerRepo()
    const redis = makeRedis()

    schedulerRepo.findCampaignsToActivate.mockResolvedValue([])

    const { service } = buildService({ schedulerRepo, redis })

    await service.activateCampaigns()

    expect(redis.initStock).not.toHaveBeenCalled()
    expect(schedulerRepo.updateCampaignStatus).not.toHaveBeenCalled()
  })

  it('không thể lấy lock → bỏ qua, không xử lý chiến dịch', async () => {
    const schedulerRepo = makeSchedulerRepo()
    const redis = makeRedis()
    redis.acquireLockToken.mockResolvedValue(null) // không thể lấy lock

    const { service } = buildService({ schedulerRepo, redis })

    await service.activateCampaigns()

    expect(schedulerRepo.findCampaignsToActivate).not.toHaveBeenCalled()
    expect(redis.initStock).not.toHaveBeenCalled()
  })

  it('kích hoạt một chiến dịch thất bại → không ảnh hưởng các chiến dịch khác', async () => {
    const schedulerRepo = makeSchedulerRepo()
    const redis = makeRedis()

    const campaigns = [
      {
        id: 'campaign-ok',
        name: 'OK Campaign',
        campaignProducts: [{ id: 'cp-ok', saleQuantity: 50 }],
        preRegistrations: []
      },
      {
        id: 'campaign-fail',
        name: 'Fail Campaign',
        campaignProducts: [{ id: 'cp-fail', saleQuantity: 50 }],
        preRegistrations: []
      }
    ]

    schedulerRepo.findCampaignsToActivate.mockResolvedValue(campaigns)
    // Chiến dịch thứ 2 gây lỗi khi initStock
    redis.initStock
      .mockResolvedValueOnce(undefined) // cp-ok thành công
      .mockRejectedValueOnce(new Error('Redis timeout')) // cp-fail thất bại

    const { service } = buildService({ schedulerRepo, redis })

    // Không được throw — phải xử lý lỗi từng chiến dịch riêng biệt
    await expect(service.activateCampaigns()).resolves.not.toThrow()

    // Chiến dịch đầu tiên vẫn được cập nhật
    expect(schedulerRepo.updateCampaignStatus).toHaveBeenCalledWith(
      'campaign-ok',
      CampaignStatus.ACTIVE
    )
  })
})

// ─── TC-02-05 ─────────────────────────────────────────────────────────────────

describe('TC-02-05: Đóng chiến dịch khi hết thời gian (ACTIVE → ENDED)', () => {
  it('đồng bộ tồn kho từ Redis về DB, cập nhật trạng thái → ENDED', async () => {
    const schedulerRepo = makeSchedulerRepo()
    const redis = makeRedis()

    const campaign = {
      id: 'campaign-id',
      name: 'Ended Flash Sale',
      campaignProducts: [{ id: 'cp-1' }, { id: 'cp-2' }]
    }
    schedulerRepo.findCampaignsToClose.mockResolvedValue([campaign])
    redis.getStock
      .mockResolvedValueOnce(10) // cp-1 còn 10
      .mockResolvedValueOnce(0) // cp-2 hết hàng

    const { service } = buildService({ schedulerRepo, redis })

    await service.closeCampaigns()

    // Đồng bộ tồn kho còn lại về DB
    expect(schedulerRepo.updateCampaignProductRemaining).toHaveBeenCalledWith(
      'cp-1',
      10
    )
    expect(schedulerRepo.updateCampaignProductRemaining).toHaveBeenCalledWith(
      'cp-2',
      0
    )

    // Trạng thái chiến dịch → ENDED
    expect(schedulerRepo.updateCampaignStatus).toHaveBeenCalledWith(
      'campaign-id',
      CampaignStatus.ENDED
    )
  })

  it('Redis không có stock key cho sản phẩm → không cập nhật remainingQuantity', async () => {
    const schedulerRepo = makeSchedulerRepo()
    const redis = makeRedis()

    const campaign = {
      id: 'campaign-id',
      name: 'Campaign Without Redis Key',
      campaignProducts: [{ id: 'cp-1' }]
    }
    schedulerRepo.findCampaignsToClose.mockResolvedValue([campaign])
    redis.getStock.mockResolvedValue(null) // key không tồn tại

    const { service } = buildService({ schedulerRepo, redis })

    await service.closeCampaigns()

    // Không gọi updateCampaignProductRemaining khi Redis trả về null
    expect(schedulerRepo.updateCampaignProductRemaining).not.toHaveBeenCalled()
    // Nhưng vẫn cập nhật trạng thái → ENDED
    expect(schedulerRepo.updateCampaignStatus).toHaveBeenCalledWith(
      'campaign-id',
      CampaignStatus.ENDED
    )
  })

  it('lock không được cấp → bỏ qua toàn bộ', async () => {
    const schedulerRepo = makeSchedulerRepo()
    const redis = makeRedis()
    redis.acquireLockToken.mockResolvedValue(null)

    const { service } = buildService({ schedulerRepo, redis })

    await service.closeCampaigns()

    expect(schedulerRepo.findCampaignsToClose).not.toHaveBeenCalled()
  })
})

// ─── releaseExpiredReservations ───────────────────────────────────────────────

describe('releaseExpiredReservations: Giải phóng đặt chỗ hết TTL', () => {
  it('giải phóng tất cả đặt chỗ quá hạn trong batch', async () => {
    const schedulerRepo = makeSchedulerRepo()
    const redis = makeRedis()
    const reservationService = makeReservationService()

    redis.getExpiredReservations.mockResolvedValue([
      'resv-1',
      'resv-2',
      'resv-3'
    ])

    const { service } = buildService({
      schedulerRepo,
      redis,
      reservationService
    })

    await service.releaseExpiredReservations()

    expect(reservationService.releaseReservation).toHaveBeenCalledTimes(3)
    expect(reservationService.releaseReservation).toHaveBeenCalledWith(
      'resv-1',
      'TTL_EXPIRED'
    )
    expect(reservationService.releaseReservation).toHaveBeenCalledWith(
      'resv-2',
      'TTL_EXPIRED'
    )
    expect(reservationService.releaseReservation).toHaveBeenCalledWith(
      'resv-3',
      'TTL_EXPIRED'
    )
  })

  it('không có đặt chỗ hết hạn → không gọi releaseReservation', async () => {
    const reservationService = makeReservationService()
    const redis = makeRedis()
    redis.getExpiredReservations.mockResolvedValue([])

    const { service } = buildService({ redis, reservationService })

    await service.releaseExpiredReservations()

    expect(reservationService.releaseReservation).not.toHaveBeenCalled()
  })

  it('một lần giải phóng thất bại → tiếp tục xử lý các đặt chỗ còn lại', async () => {
    const redis = makeRedis()
    const reservationService = makeReservationService()

    redis.getExpiredReservations.mockResolvedValue(['resv-ok', 'resv-fail'])
    reservationService.releaseReservation
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('DB error'))

    const { service } = buildService({ redis, reservationService })

    await expect(service.releaseExpiredReservations()).resolves.not.toThrow()
    expect(reservationService.releaseReservation).toHaveBeenCalledTimes(2)
  })
})
