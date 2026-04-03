import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
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
import { TelegramNotificationService } from '../services/telegram-notification.service'
import {
  NotificationPreferencesResponseDto,
  UpdateNotificationPreferencesDto
} from '../dto/notification-preferences.dto'
import {
  TelegramLinkStatusResponseDto,
  TelegramLinkTokenResponseDto
} from '../dto/telegram.dto'

const moduleName = 'notifications'

@ApiTags(moduleName)
@Controller(moduleName)
@UseGuards(AccessTokenGuard)
@UseInterceptors(ResponseInterceptor)
@ApiBearerAuth('JWT-auth')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly telegramNotificationService: TelegramNotificationService
  ) {}

  @ApiOperation({ summary: 'Lấy danh sách thông báo của tôi' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách thông báo'
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
  @ApiParam({ name: 'id', description: 'ID thông báo' })
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

  @ApiOperation({ summary: 'Lấy cấu hình thông báo của người dùng hiện tại' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Trả về notification preferences',
    type: NotificationPreferencesResponseDto
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @Get('preferences')
  @HttpCode(HttpStatus.OK)
  async getPreferences(
    @CurrentUser() user: { userId: string }
  ): Promise<NotificationPreferencesResponseDto> {
    return this.notificationService.getPreferences(user.userId)
  }

  @ApiOperation({
    summary: 'Cập nhật cấu hình thông báo của người dùng hiện tại'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Cập nhật thành công',
    type: NotificationPreferencesResponseDto
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @Patch('preferences')
  @HttpCode(HttpStatus.OK)
  async updatePreferences(
    @CurrentUser() user: { userId: string },
    @Body() body: UpdateNotificationPreferencesDto
  ): Promise<NotificationPreferencesResponseDto> {
    return this.notificationService.updatePreferences(user.userId, body)
  }

  @ApiOperation({ summary: 'Tạo deep link token để liên kết Telegram bot' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Tạo token liên kết thành công',
    type: TelegramLinkTokenResponseDto
  })
  @Post('telegram/link-token')
  @HttpCode(HttpStatus.OK)
  async createTelegramLinkToken(
    @CurrentUser() user: { userId: string }
  ): Promise<TelegramLinkTokenResponseDto> {
    return this.telegramNotificationService.createLinkToken(user.userId)
  }

  @ApiOperation({ summary: 'Lấy trạng thái liên kết Telegram' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Trả về trạng thái liên kết Telegram',
    type: TelegramLinkStatusResponseDto
  })
  @Get('telegram/status')
  @HttpCode(HttpStatus.OK)
  async getTelegramStatus(
    @CurrentUser() user: { userId: string }
  ): Promise<TelegramLinkStatusResponseDto> {
    return this.telegramNotificationService.getLinkStatus(user.userId)
  }

  @ApiOperation({ summary: 'Hủy liên kết Telegram hiện tại' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Hủy liên kết thành công'
  })
  @Delete('telegram/link')
  @HttpCode(HttpStatus.OK)
  async unlinkTelegram(
    @CurrentUser() user: { userId: string }
  ): Promise<{ revoked: boolean }> {
    const revoked = await this.telegramNotificationService.unlink(user.userId)

    await this.notificationService.updatePreferences(user.userId, {
      telegramEnabled: false
    })

    return revoked
  }
}
