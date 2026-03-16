import {
  Controller,
  Get,
  Put,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ResponseInterceptor } from '@common/interceptors'
import { AccessTokenGuard } from '@common/guards'
import { CurrentUser, IUserFromRequest } from '@common/decorators'
import {
  GetNotificationsQueryDto,
  GetNotificationsResponseDto,
  UpdateNotificationStatusDto,
  UpdateNotificationStatusResponseDto
} from '../dto/notification.dto'
import { NotificationService } from '../services'

const moduleName = 'notification'

/**
 * Notification Controller following SOLID principles
 * Handles HTTP requests for notification management
 */
@ApiTags(moduleName)
@Controller(moduleName)
@UseInterceptors(ResponseInterceptor)
@UseGuards(AccessTokenGuard)
@ApiBearerAuth('JWT-auth')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Get list of notifications with filters and pagination
   */
  @ApiOperation({
    summary: 'Get notifications',
    description:
      'Returns paginated list of notifications with filters (type, read status)'
  })
  @Get('get-list')
  @HttpCode(HttpStatus.OK)
  async getNotifications(
    @CurrentUser() user: IUserFromRequest,
    @Query() query: GetNotificationsQueryDto
  ): Promise<GetNotificationsResponseDto> {
    return await this.notificationService.getNotifications(user.userId, query)
  }

  /**
   * Update notification read status
   */
  @ApiOperation({
    summary: 'Update notification status',
    description:
      'Mark notifications as read. Can mark specific notifications or all unread notifications.'
  })
  @Put('update-status')
  @HttpCode(HttpStatus.OK)
  async updateNotificationStatus(
    @CurrentUser() user: IUserFromRequest,
    @Body() updateDto: UpdateNotificationStatusDto
  ): Promise<UpdateNotificationStatusResponseDto> {
    return await this.notificationService.updateNotificationStatus(
      user.userId,
      updateDto
    )
  }
}
