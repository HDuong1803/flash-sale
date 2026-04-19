import { ConfigService } from '@nestjs/config'
import { RedisService } from '@infrastructure/redis/redis.service'
import { AnalyticsRepository } from '../repositories/analytics.repository'
import { AnalyticsService } from './analytics.service'
import { AnalyticsSchedulerService } from './analytics-scheduler.service'

jest.mock('@infrastructure/redis/redis.service', () => ({
  RedisService: class RedisService {}
}))

describe('AnalyticsSchedulerService', () => {
  let redis: {
    acquireLockToken: jest.Mock
    extendLockToken: jest.Mock
    releaseLockToken: jest.Mock
  }
  let analyticsRepo: {
    findActiveCampaignProducts: jest.Mock
    deleteSnapshotsOlderThan: jest.Mock
    hasSnapshotsOlderThan: jest.Mock
  }
  let analyticsService: {
    createSnapshot: jest.Mock
  }

  const createConfigService = (
    values: Record<string, string | undefined>
  ): Pick<ConfigService, 'get'> => ({
    get: jest.fn((key: string) => values[key])
  })

  const buildService = (config: Record<string, string | undefined>) =>
    new AnalyticsSchedulerService(
      redis as unknown as RedisService,
      analyticsService as unknown as AnalyticsService,
      analyticsRepo as unknown as AnalyticsRepository,
      createConfigService(config) as ConfigService
    )

  beforeEach(() => {
    redis = {
      acquireLockToken: jest.fn().mockResolvedValue('lock-token'),
      extendLockToken: jest.fn().mockResolvedValue(true),
      releaseLockToken: jest.fn().mockResolvedValue(undefined)
    }

    analyticsRepo = {
      findActiveCampaignProducts: jest.fn().mockResolvedValue([]),
      deleteSnapshotsOlderThan: jest.fn().mockResolvedValue(0),
      hasSnapshotsOlderThan: jest.fn().mockResolvedValue(false)
    }

    analyticsService = {
      createSnapshot: jest.fn().mockResolvedValue(undefined)
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('skips cleanup when cleanup is disabled by config', async () => {
    const service = buildService({
      ANALYTICS_SNAPSHOT_CLEANUP_ENABLED: 'false'
    })

    await service.cleanupSnapshotHistory()

    expect(redis.acquireLockToken).not.toHaveBeenCalled()
    expect(analyticsRepo.deleteSnapshotsOlderThan).not.toHaveBeenCalled()
  })

  it('deletes stale snapshots in batches and stops when final batch is smaller than limit', async () => {
    analyticsRepo.deleteSnapshotsOlderThan
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(30)

    const service = buildService({
      ANALYTICS_SNAPSHOT_CLEANUP_ENABLED: 'true',
      ANALYTICS_SNAPSHOT_CLEANUP_BATCH_SIZE: '100',
      ANALYTICS_SNAPSHOT_CLEANUP_MAX_BATCHES: '10',
      ANALYTICS_SNAPSHOT_RETENTION_DAYS: '30'
    })

    await service.cleanupSnapshotHistory()

    expect(redis.acquireLockToken).toHaveBeenCalledWith(
      'analytics:cron:cleanup:lock',
      900_000
    )
    expect(analyticsRepo.deleteSnapshotsOlderThan).toHaveBeenCalledTimes(2)
    expect(analyticsRepo.hasSnapshotsOlderThan).not.toHaveBeenCalled()
    expect(redis.releaseLockToken).toHaveBeenCalledWith(
      'analytics:cron:cleanup:lock',
      'lock-token'
    )
  })

  it('probes remaining stale data when cleanup reaches max batches', async () => {
    analyticsRepo.deleteSnapshotsOlderThan
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
    analyticsRepo.hasSnapshotsOlderThan.mockResolvedValue(true)

    const service = buildService({
      ANALYTICS_SNAPSHOT_CLEANUP_ENABLED: 'true',
      ANALYTICS_SNAPSHOT_CLEANUP_BATCH_SIZE: '2',
      ANALYTICS_SNAPSHOT_CLEANUP_MAX_BATCHES: '2',
      ANALYTICS_SNAPSHOT_RETENTION_DAYS: '30'
    })

    await service.cleanupSnapshotHistory()

    expect(analyticsRepo.deleteSnapshotsOlderThan).toHaveBeenCalledTimes(2)
    expect(analyticsRepo.hasSnapshotsOlderThan).toHaveBeenCalledTimes(1)
  })

  it('skips cleanup when lock is not acquired', async () => {
    redis.acquireLockToken.mockResolvedValueOnce(null)

    const service = buildService({
      ANALYTICS_SNAPSHOT_CLEANUP_ENABLED: 'true'
    })

    await service.cleanupSnapshotHistory()

    expect(analyticsRepo.deleteSnapshotsOlderThan).not.toHaveBeenCalled()
    expect(redis.releaseLockToken).not.toHaveBeenCalled()
  })

  it('still releases cleanup lock when delete batch throws', async () => {
    analyticsRepo.deleteSnapshotsOlderThan.mockRejectedValueOnce(
      new Error('cleanup failed')
    )

    const service = buildService({
      ANALYTICS_SNAPSHOT_CLEANUP_ENABLED: 'true'
    })

    await expect(service.cleanupSnapshotHistory()).rejects.toThrow(
      'cleanup failed'
    )

    expect(redis.releaseLockToken).toHaveBeenCalledWith(
      'analytics:cron:cleanup:lock',
      'lock-token'
    )
  })

  it('falls back to default batch size when numeric config is malformed', async () => {
    analyticsRepo.deleteSnapshotsOlderThan.mockResolvedValueOnce(4000)

    const service = buildService({
      ANALYTICS_SNAPSHOT_CLEANUP_ENABLED: 'true',
      ANALYTICS_SNAPSHOT_CLEANUP_BATCH_SIZE: '100abc'
    })

    await service.cleanupSnapshotHistory()

    expect(analyticsRepo.deleteSnapshotsOlderThan).toHaveBeenCalledWith(
      expect.any(Date),
      5000
    )
  })

  it('keeps legacy snapshot lock key for rolling-deploy compatibility', async () => {
    const service = buildService({})

    await service.runSnapshotCycle()

    expect(redis.acquireLockToken).toHaveBeenCalledWith(
      'analytics:cron:lock',
      240_000
    )
    expect(redis.releaseLockToken).toHaveBeenCalledWith(
      'analytics:cron:lock',
      'lock-token'
    )
  })
})
