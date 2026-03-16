import { Module } from '@nestjs/common'
import { DashboardController } from './controllers/dashboard.controller'
import { DashboardRepository } from './repositories/dashboard.repository'

@Module({
  controllers: [DashboardController],
  providers: [DashboardRepository]
})
export class DashboardModule {}
