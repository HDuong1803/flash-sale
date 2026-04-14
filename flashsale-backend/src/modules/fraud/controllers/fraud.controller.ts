import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { AccessTokenGuard } from '@common/guards/access-token.guard'
import { RolesGuard } from '@common/guards/roles.guard'
import { Roles } from '@common/decorators/roles.decorator'
import { CurrentUser } from '@common/decorators/current-user.decorator'
import { ResponseInterceptor } from '@common/interceptors/response.interceptor'
import { FraudService } from '../services/fraud.service'
import { BlacklistIpDto, FraudQueryDto, FraudStatsDto } from '../dto/fraud.dto'

const moduleName = 'admin/fraud'

@ApiTags(moduleName)
@Controller(moduleName)
@UseInterceptors(ResponseInterceptor)
@ApiBearerAuth('JWT-auth')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class FraudController {
  constructor(private readonly fraudService: FraudService) {}

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Thống kê fraud theo khoảng thời gian',
    description: 'Trả về tổng số events, số bị block, block rate, và top IPs.'
  })
  @ApiQuery({
    name: 'period',
    description: 'Khoảng thời gian (1h, 6h, 24h, 7d)',
    required: false,
    example: '24h'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Fraud statistics',
    type: FraudStatsDto
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Không đủ quyền' })
  async getStats(
    @Query('period') period: string = '24h'
  ): Promise<FraudStatsDto> {
    const since = parsePeriod(period)
    return this.fraudService.getStats(since)
  }

  @Get('events')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Danh sách fraud events có phân trang' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Paginated fraud events' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  async getEvents(@Query() query: FraudQueryDto) {
    return this.fraudService.getEvents({
      page: query.page,
      limit: query.limit,
      blocked: query.blocked
    })
  }

  @Get('blacklist')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Danh sách IP đang bị blacklist' })
  @ApiResponse({ status: HttpStatus.OK, description: 'IP blacklist entries' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  async getBlacklist() {
    return this.fraudService.getBlacklist()
  }

  @Post('blacklist')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Thêm IP vào blacklist',
    description: 'Blacklist tạm thời (hours) hoặc vĩnh viễn (không có hours).'
  })
  @ApiBody({ type: BlacklistIpDto })
  @ApiResponse({ status: HttpStatus.OK, description: 'IP đã được blacklist' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation error'
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  async blacklistIp(
    @Body() dto: BlacklistIpDto,
    @CurrentUser() user: { id: string }
  ): Promise<{ ok: boolean }> {
    await this.fraudService.blacklistIp(
      dto.ipAddress,
      dto.reason,
      user.id,
      dto.hours
    )
    return { ok: true }
  }

  @Delete('blacklist/:ip')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xóa IP khỏi blacklist' })
  @ApiParam({
    name: 'ip',
    description: 'IP address to unblock',
    example: '192.168.1.100'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'IP đã được bỏ blacklist'
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  async removeFromBlacklist(@Param('ip') ip: string): Promise<{ ok: boolean }> {
    await this.fraudService.removeFromBlacklist(ip)
    return { ok: true }
  }
}

// ─── Pure helpers ──────────────────────────────────────────────────────────────

function parsePeriod(period: string): Date {
  const now = Date.now()
  const map: Record<string, number> = {
    '1h': 1 * 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  }
  const ms = map[period] ?? map['24h']!
  return new Date(now - ms)
}
