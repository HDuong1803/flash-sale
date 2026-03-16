import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { ResponseInterceptor } from '@common/interceptors'
import { AccessTokenGuard } from '@common/guards/access-token.guard'
import { RolesGuard } from '@common/guards/roles.guard'
import { Roles } from '@common/decorators/roles.decorator'
import { CurrentUser } from '@common/decorators/current-user.decorator'
import { CheckoutService } from '../services/checkout.service'
import { CheckoutDto, CheckoutResponseDto } from '../dto/checkout.dto'

const moduleName = 'checkout'

@ApiTags(moduleName)
@Controller(moduleName)
@UseInterceptors(ResponseInterceptor)
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @ApiOperation({ summary: 'Khởi tạo thanh toán cho reservation đang HOLDING' })
  @ApiBody({ type: CheckoutDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: CheckoutResponseDto,
    description: 'Trả về URL thanh toán'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Reservation hết hạn'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Không có quyền truy cập reservation'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiBearerAuth('JWT-auth')
  @Post()
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('CUSTOMER', 'MERCHANT')
  async checkout(
    @CurrentUser() user: { userId: string },
    @Body() dto: CheckoutDto
  ): Promise<CheckoutResponseDto> {
    return this.checkoutService.initiate(user.userId, dto)
  }
}
