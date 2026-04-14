import { Module } from '@nestjs/common'
import { AnalyticsController } from './controllers/analytics.controller'
import { FunnelController } from './controllers/funnel.controller'
import { AnalyticsService } from './services/analytics.service'
import { PredictionService } from './services/prediction.service'
import { AnalyticsSchedulerService } from './services/analytics-scheduler.service'
import { AnalyticsRepository } from './repositories/analytics.repository'

@Module({
  controllers: [AnalyticsController, FunnelController],
  providers: [
    AnalyticsService,
    PredictionService,
    AnalyticsSchedulerService,
    AnalyticsRepository
  ],
  exports: [AnalyticsService, PredictionService]
})
export class AnalyticsModule {}
