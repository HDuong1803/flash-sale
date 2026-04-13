import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Redirect,
  Req,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { ResponseInterceptor } from '@common/interceptors'
import { Public } from '@common/decorators/public.decorator'
import { AccessTokenGuard } from '@common/guards'
import {
  CurrentUser,
  IUserFromRequest
} from '@common/decorators/current-user.decorator'
import { PaymentService } from '../services/payment.service'
import {
  PaymentWebhookDto,
  WebhookResponseDto,
  PaymentStatusResponseDto
} from '../dto/payment.dto'
import type { Request } from 'express'

const moduleName = 'payments'

@ApiTags(moduleName)
@Controller(moduleName)
@UseInterceptors(ResponseInterceptor)
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name)

  constructor(
    private readonly paymentService: PaymentService,
    private readonly configService: ConfigService
  ) {}

  // ─── Webhook generic (legacy) ──────────────────────────────────────────────

  @ApiOperation({
    summary: 'Nhận kết quả từ cổng thanh toán (webhook — legacy)',
    description:
      'Endpoint legacy. Yêu cầu header X-Webhook-Secret khớp với PAYMENT_WEBHOOK_SECRET. ' +
      'Nên dùng /webhook/stripe cho tích hợp Stripe.'
  })
  @ApiBody({ type: PaymentWebhookDto })
  @ApiResponse({ status: HttpStatus.OK, type: WebhookResponseDto })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Secret không hợp lệ'
  })
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @Public()
  async webhook(
    @Body() dto: PaymentWebhookDto,
    @Headers('x-webhook-secret') secret?: string
  ): Promise<WebhookResponseDto> {
    const expectedSecret = this.configService.get<string>(
      'secrets.PAYMENT_WEBHOOK_SECRET',
      ''
    )

    if (!expectedSecret || !secret || secret !== expectedSecret) {
      this.logger.warn({
        event: 'legacy_webhook_rejected',
        reason: !expectedSecret ? 'secret_not_configured' : 'secret_mismatch'
      })
      throw new ForbiddenException('Unauthorized webhook request')
    }

    return this.paymentService.handleWebhook(dto)
  }

  @ApiOperation({
    summary: 'Stripe webhook — xử lý checkout session completed'
  })
  @ApiResponse({ status: HttpStatus.OK, type: WebhookResponseDto })
  @Post('webhook/stripe')
  @HttpCode(HttpStatus.OK)
  @Public()
  async handleStripeWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') stripeSignature?: string
  ): Promise<WebhookResponseDto> {
    const payload = req.rawBody
    if (!payload) return { received: false }
    return this.paymentService.handleStripeWebhook(payload, stripeSignature)
  }

  // ─── Payment status (dành cho frontend polling) ────────────────────────────

  @ApiOperation({
    summary:
      'Kiểm tra trạng thái thanh toán — frontend dùng để thăm dò trạng thái',
    description:
      'Frontend gọi endpoint này mỗi 3 giây sau khi hiển thị trang QR. ' +
      'Khi status = SUCCESS, frontend redirect về trang xác nhận đơn hàng.'
  })
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'paymentId', description: 'ID thanh toán' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PaymentStatusResponseDto,
    description: 'Trạng thái hiện tại của payment'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment không tồn tại hoặc không thuộc về user này'
  })
  @Get(':paymentId/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard)
  async getPaymentStatus(
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: IUserFromRequest
  ): Promise<PaymentStatusResponseDto> {
    return this.paymentService.getPaymentStatus(paymentId, user.userId)
  }

  // ─── Return redirect (sau khi thanh toán) ─────────────────────────────────

  @ApiOperation({
    summary: 'Redirect người dùng về frontend sau khi thanh toán'
  })
  @ApiResponse({
    status: HttpStatus.FOUND,
    description: 'Redirect về frontend /payment/return'
  })
  @Get('return')
  @HttpCode(HttpStatus.FOUND)
  @Public()
  @Redirect()
  async returnFromPayment(@Query() query: Record<string, string>) {
    const clientUrl = this.configService.get<string>(
      'application.CLIENT_URL_SERVER',
      ''
    )

    // Chỉ forward các param đã biết — KHÔNG forward hết query string
    // Lý do: tránh open redirect attack và injection qua query params
    const safeParams = new URLSearchParams()
    if (query['paymentId']) safeParams.set('paymentId', query['paymentId'])
    if (query['status']) safeParams.set('status', query['status'])
    if (query['orderId']) safeParams.set('orderId', query['orderId'])

    return {
      url: `${clientUrl}/payment/return?${safeParams}`,
      statusCode: 302
    }
  }
}
