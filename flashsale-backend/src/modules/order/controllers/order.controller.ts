import {
  Body,
  Controller,
  Get,
  Headers,
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
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { ResponseInterceptor } from '@common/interceptors'
import { AccessTokenGuard } from '@common/guards/access-token.guard'
import { RolesGuard } from '@common/guards/roles.guard'
import { IdempotencyGuard } from '@common/guards/idempotency.guard'
import { PurchaseRateLimitGuard } from '@common/guards/purchase-rate-limit.guard'
import { Roles } from '@common/decorators/roles.decorator'
import { CurrentUser } from '@common/decorators/current-user.decorator'
import { OrderGatewayService } from '../services/order-gateway.service'
import { FraudGuard } from '@modules/fraud/fraud.guard'
import {
  OrderQueryDto,
  OrderResponseDto,
  PurchaseDto,
  PurchaseResponseDto,
  PurchaseResultResponseDto
} from '../dto/order.dto'

const moduleName = 'orders'

@ApiTags(moduleName)
@Controller(moduleName)
@UseGuards(AccessTokenGuard)
@UseInterceptors(ResponseInterceptor)
@ApiBearerAuth('JWT-auth')
export class OrderController {
  constructor(private readonly orderGatewayService: OrderGatewayService) {}

  @ApiOperation({
    summary: 'Đặt hàng flash sale (async) — trả về requestId để poll kết quả'
  })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    description: 'CUID duy nhất để tránh đặt trùng đơn (bắt buộc)',
    required: true
  })
  @ApiBody({ type: PurchaseDto })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    type: PurchaseResponseDto,
    description: 'Yêu cầu đã được xếp hàng'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Flash Sale kết thúc hoặc đã mua đủ giới hạn'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @Post('purchase')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(RolesGuard, FraudGuard, IdempotencyGuard, PurchaseRateLimitGuard)
  @Roles('CUSTOMER', 'MERCHANT')
  async purchase(
    @CurrentUser() user: { userId: string },
    @Body() dto: PurchaseDto,
    @Headers('x-idempotency-key') idempotencyKey: string
  ): Promise<PurchaseResponseDto> {
    return this.orderGatewayService.purchase(user.userId, dto, idempotencyKey)
  }

  @ApiOperation({ summary: 'Poll kết quả đặt hàng theo requestId' })
  @ApiParam({
    name: 'requestId',
    description: 'ID yêu cầu nhận từ POST /orders/purchase'
  })
  @ApiResponse({ status: HttpStatus.OK, type: PurchaseResultResponseDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @Get('result/:requestId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('CUSTOMER', 'MERCHANT')
  async getResult(
    @Param('requestId') requestId: string,
    @CurrentUser() user: { userId: string }
  ): Promise<PurchaseResultResponseDto> {
    return this.orderGatewayService.getResult(
      requestId,
      user.userId
    ) as unknown as PurchaseResultResponseDto
  }

  @ApiOperation({ summary: 'Danh sách đơn hàng của tôi' })
  @ApiResponse({ status: HttpStatus.OK, type: [OrderResponseDto] })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @Get()
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('CUSTOMER', 'MERCHANT')
  async getMyOrders(
    @CurrentUser() user: { userId: string; role: string },
    @Query() query: OrderQueryDto
  ): Promise<OrderResponseDto[]> {
    return this.orderGatewayService.getMyOrders(
      user.userId,
      user.role,
      query
    ) as unknown as OrderResponseDto[]
  }

  @ApiOperation({ summary: 'Xem chi tiết một đơn hàng' })
  @ApiParam({ name: 'id', description: 'ID đơn hàng' })
  @ApiResponse({ status: HttpStatus.OK, type: OrderResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Đơn hàng không tồn tại'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Không có quyền truy cập'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('CUSTOMER', 'MERCHANT', 'ADMIN')
  async getOrderById(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string }
  ): Promise<OrderResponseDto> {
    return this.orderGatewayService.getOrderById(
      id,
      user.userId,
      user.role
    ) as unknown as OrderResponseDto
  }
}
