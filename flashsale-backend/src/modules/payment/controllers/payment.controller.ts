import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Redirect,
  UseInterceptors
} from '@nestjs/common'
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ResponseInterceptor } from '@common/interceptors'
import { Public } from '@common/decorators/public.decorator'
import { PaymentService } from '../services/payment.service'
import { PaymentWebhookDto, WebhookResponseDto } from '../dto/payment.dto'

const moduleName = 'payments'

@ApiTags(moduleName)
@Controller(moduleName)
@UseInterceptors(ResponseInterceptor)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @ApiOperation({ summary: 'Nhận kết quả từ cổng thanh toán (webhook)' })
  @ApiBody({ type: PaymentWebhookDto })
  @ApiResponse({ status: HttpStatus.OK, type: WebhookResponseDto })
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @Public()
  async webhook(@Body() dto: PaymentWebhookDto): Promise<WebhookResponseDto> {
    return this.paymentService.handleWebhook(dto)
  }

  @ApiOperation({
    summary: 'Redirect người dùng về frontend sau khi thanh toán'
  })
  @ApiResponse({
    status: HttpStatus.FOUND,
    description: 'Redirect về frontend'
  })
  @Get('return')
  @HttpCode(HttpStatus.FOUND)
  @Public()
  @Redirect()
  async returnFromPayment(@Query() query: Record<string, string>) {
    const frontendUrl = process.env.FRONTEND_URL ?? ''
    const params = new URLSearchParams(query).toString()
    return { url: `${frontendUrl}/payment/return?${params}`, statusCode: 302 }
  }
}
