import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UseInterceptors
} from '@nestjs/common'
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ResponseInterceptor } from '@common/interceptors/response.interceptor'
import { AnalyticsService } from '../services/analytics.service'
import { TrackFunnelEventDto } from '../dto/analytics.dto'

/**
 * Public funnel tracking endpoint — no auth required.
 * Fire-and-forget: always returns 204, errors are swallowed server-side.
 * Rate limiting should be applied at the nginx/gateway level.
 */
@ApiTags('analytics')
@Controller('analytics/funnel')
@UseInterceptors(ResponseInterceptor)
export class FunnelController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('track')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '[Public] Ghi nhận sự kiện funnel từ frontend',
    description:
      'Không yêu cầu xác thực. Client gửi sessionId + step + campaignId. ' +
      'Server luôn trả 204 — lỗi được log server-side, không ảnh hưởng UX.'
  })
  @ApiBody({ type: TrackFunnelEventDto })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Event recorded (or silently ignored)'
  })
  async track(
    @Body() dto: TrackFunnelEventDto,
    @Ip() ip: string
  ): Promise<void> {
    // Fire-and-forget — result is discarded
    void this.analyticsService.trackFunnelEvent(
      dto.sessionId,
      dto.campaignId,
      dto.step,
      {
        userId: dto.userId,
        metadata: dto.metadata,
        ipAddress: ip
      }
    )
  }
}
