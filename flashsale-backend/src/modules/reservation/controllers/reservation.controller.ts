import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { RolesGuard } from '@common/guards/roles.guard'
import { Roles } from '@common/decorators/roles.decorator'
import { CurrentUser } from '@common/decorators/current-user.decorator'
import { ReservationService } from '../services/reservation.service'

const moduleName = 'reservations'

@ApiTags(moduleName)
@Controller(moduleName)
@UseInterceptors(ResponseInterceptor)
@UseGuards(AccessTokenGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class ReservationController {
  constructor(private readonly reservationService: ReservationService) {}

  @ApiOperation({
    summary: 'Lấy danh sách giữ chỗ đang HOLDING của người dùng hiện tại'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách giữ chỗ đang hoạt động'
  })
  @Get('me/active')
  @HttpCode(HttpStatus.OK)
  @Roles('CUSTOMER', 'MERCHANT')
  async getMyActive(@CurrentUser() user: { userId: string }) {
    return this.reservationService.getActiveForCustomer(user.userId)
  }

  @ApiOperation({ summary: 'Lấy chi tiết giữ chỗ theo reservationId' })
  @ApiParam({ name: 'id', description: 'ID giữ chỗ' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Trả về chi tiết giữ chỗ của chính người dùng hiện tại'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy giữ chỗ hoặc không thuộc quyền truy cập'
  })
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('CUSTOMER', 'MERCHANT')
  async getById(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string }
  ) {
    return this.reservationService.getDetailForCustomer(id, user.userId)
  }

  @ApiOperation({ summary: 'Huỷ giữ chỗ đang HOLDING' })
  @ApiParam({ name: 'id', description: 'ID giữ chỗ' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Giữ chỗ đã được huỷ thành công'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy giữ chỗ'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Giữ chỗ không ở trạng thái HOLDING'
  })
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('CUSTOMER', 'MERCHANT')
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string }
  ) {
    await this.reservationService.cancelReservation(id, user.userId)
    return { message: 'Đã huỷ giữ chỗ thành công' }
  }
}
