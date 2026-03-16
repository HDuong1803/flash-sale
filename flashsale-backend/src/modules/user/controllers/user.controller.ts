import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
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
import { UserService } from '../services/user.service'
import { SafeUser } from '../repositories/user.repository'
import { UpdateProfileDto } from '../dto/update-profile.dto'
import { UserResponseDto } from '../dto/user-response.dto'
import { AccessTokenGuard } from '@common/guards/access-token.guard'
import { CurrentUser } from '@common/decorators/current-user.decorator'
import { ResponseInterceptor } from '@common/interceptors/response.interceptor'

const moduleName = 'user'

@ApiTags(moduleName)
@Controller(moduleName)
@UseGuards(AccessTokenGuard)
@UseInterceptors(ResponseInterceptor)
@ApiBearerAuth('JWT-auth')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lấy thông tin người dùng hiện tại' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Thành công',
    type: UserResponseDto
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Người dùng không tồn tại'
  })
  async getMe(@CurrentUser() user: { userId: string }): Promise<SafeUser> {
    return this.userService.getMe(user.userId)
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cập nhật thông tin cá nhân' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Cập nhật thành công',
    type: UserResponseDto
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Dữ liệu không hợp lệ'
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  async updateProfile(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdateProfileDto
  ): Promise<SafeUser> {
    return this.userService.updateProfile(user.userId, dto)
  }
}
