import { Global, Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { ActivityLogService } from './activity-log.service'
import { ActivityLogInterceptor } from './activity-log.interceptor'

/**
 * ActivityLogModule — global module so ActivityLogService is injectable anywhere
 * and ActivityLogInterceptor is registered once for the entire app.
 */
@Global()
@Module({
  providers: [
    ActivityLogService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ActivityLogInterceptor
    }
  ],
  exports: [ActivityLogService]
})
export class ActivityLogModule {}
