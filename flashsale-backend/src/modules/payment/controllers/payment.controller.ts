import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Redirect,
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
import { PaymentWebhookDto, WebhookResponseDto } from '../dto/payment.dto'
import {
  SepayWebhookDto,
  SepayWebhookResponseDto,
  PaymentStatusResponseDto
} from '../dto/sepay-webhook.dto'
import { SepayWebhookGuard } from '../guards/sepay-webhook.guard'

const moduleName = 'payments'

@ApiTags(moduleName)
@Controller(moduleName)
@UseInterceptors(ResponseInterceptor)
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly configService: ConfigService
  ) {}

  // ─── Webhook generic (legacy) ──────────────────────────────────────────────

  @ApiOperation({ summary: 'Nhận kết quả từ cổng thanh toán (webhook)' })
  @ApiBody({ type: PaymentWebhookDto })
  @ApiResponse({ status: HttpStatus.OK, type: WebhookResponseDto })
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @Public()
  async webhook(@Body() dto: PaymentWebhookDto): Promise<WebhookResponseDto> {
    return this.paymentService.handleWebhook(dto)
  }

  // ─── SePay webhook ─────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'SePay webhook — nhận thông báo giao dịch ngân hàng từ SePay'
  })
  @ApiBody({ type: SepayWebhookDto })
  @ApiResponse({ status: HttpStatus.OK, type: SepayWebhookResponseDto })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Webhook signature không hợp lệ'
  })
  @Post('webhook/sepay')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(SepayWebhookGuard)
  async handleSepayWebhook(
    @Body() dto: SepayWebhookDto
  ): Promise<SepayWebhookResponseDto> {
    return this.paymentService.handleSepayWebhook(dto)
  }

  // ─── Payment status (dành cho frontend polling) ────────────────────────────

  @ApiOperation({
    summary: 'Kiểm tra trạng thái thanh toán — frontend dùng để polling',
    description:
      'Frontend gọi endpoint này mỗi 3 giây sau khi hiển thị trang QR. ' +
      'Khi status = SUCCESS, frontend redirect về trang xác nhận đơn hàng.'
  })
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'paymentId', description: 'ID của payment' })
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
    const frontendUrl = this.configService.get<string>('frontend.FRONTEND_URL', '')

    // Chỉ forward các param đã biết — KHÔNG forward hết query string
    // Lý do: tránh open redirect attack và injection qua query params
    const safeParams = new URLSearchParams()
    if (query['paymentId']) safeParams.set('paymentId', query['paymentId'])
    if (query['status']) safeParams.set('status', query['status'])
    if (query['orderId']) safeParams.set('orderId', query['orderId'])

    return {
      url: `${frontendUrl}/payment/return?${safeParams}`,
      statusCode: 302
    }
  }
}
