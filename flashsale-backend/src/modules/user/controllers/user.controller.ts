import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { UserService } from '../services/user.service'
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
  async getMe(
    @CurrentUser() user: { userId: string }
  ): Promise<UserResponseDto> {
    return this.userService.getMe(user.userId) as unknown as UserResponseDto
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Cập nhật thông tin cá nhân (có thể kèm ảnh đại diện)'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: {
          type: 'string',
          example: 'Nguyễn Văn An'
        },
        phone: {
          type: 'string',
          example: '0912345678'
        },
        defaultAddress: {
          type: 'string',
          example: '123 Đường Lê Lợi, Quận 1, TP.HCM'
        },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Ảnh đại diện (tùy chọn)'
        }
      }
    }
  })
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
    @Body() dto: UpdateProfileDto,
    @UploadedFile() file?: Express.Multer.File
  ): Promise<UserResponseDto> {
    return this.userService.updateProfile(
      user.userId,
      dto,
      file
    ) as unknown as UserResponseDto
  }
}
