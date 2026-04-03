import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseInterceptors
} from '@nestjs/common'
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '@common/decorators'
import { ResponseInterceptor } from '@common/interceptors'
import {
  TelegramNotificationService,
  TelegramWebhookUpdate
} from '../services/telegram-notification.service'

const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token'

@ApiTags('integrations')
@Controller('integrations/telegram')
@UseInterceptors(ResponseInterceptor)
export class TelegramWebhookController {
  constructor(
    private readonly telegramNotificationService: TelegramNotificationService
  ) {}

  @ApiOperation({ summary: 'Telegram webhook receiver' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Webhook processed' })
  @ApiHeader({
    name: 'X-Telegram-Bot-Api-Secret-Token',
    required: true,
    description: 'Telegram webhook secret token (setWebhook secret_token)'
  })
  @Public(true)
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers(TELEGRAM_SECRET_HEADER) secretToken: string | undefined,
    @Body() body: TelegramWebhookUpdate
  ): Promise<{ ok: boolean }> {
    return this.telegramNotificationService.handleWebhook(secretToken, body)
  }

  @ApiOperation({
    summary: 'Telegram webhook receiver (legacy path secret, deprecated)'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Webhook processed' })
  @ApiHeader({
    name: 'X-Telegram-Bot-Api-Secret-Token',
    required: false,
    description:
      'Preferred authentication header. Legacy path secret is temporarily supported for migration.'
  })
  @Public(true)
  @Post('webhook/:secret')
  @HttpCode(HttpStatus.OK)
  async handleWebhookLegacy(
    @Param('secret') legacyPathSecret: string,
    @Headers(TELEGRAM_SECRET_HEADER) secretToken: string | undefined,
    @Body() body: TelegramWebhookUpdate
  ): Promise<{ ok: boolean }> {
    return this.telegramNotificationService.handleWebhook(
      secretToken,
      body,
      legacyPathSecret
    )
  }
}
