import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { ResponseInterceptor } from '@common/interceptors'
import { AccessTokenGuard } from '@common/guards/access-token.guard'
import { CurrentUser } from '@common/decorators/current-user.decorator'
import { NotificationService } from '../services/notification.service'

const moduleName = 'notifications'

@ApiTags(moduleName)
@Controller(moduleName)
@UseGuards(AccessTokenGuard)
@UseInterceptors(ResponseInterceptor)
@ApiBearerAuth('JWT-auth')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @ApiOperation({ summary: 'Lấy danh sách thông báo của tôi' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách notifications'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @Get()
  @HttpCode(HttpStatus.OK)
  async getNotifications(
    @CurrentUser() user: { userId: string }
  ): Promise<unknown[]> {
    return this.notificationService.getNotifications(user.userId)
  }

  @ApiOperation({ summary: 'Đánh dấu một thông báo đã đọc' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Đánh dấu thành công' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string
  ): Promise<unknown> {
    return this.notificationService.markRead(user.userId, id)
  }

  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo đã đọc' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Đánh dấu tất cả thành công'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(
    @CurrentUser() user: { userId: string }
  ): Promise<{ updated: boolean }> {
    await this.notificationService.markAllRead(user.userId)
    return { updated: true }
  }
}
