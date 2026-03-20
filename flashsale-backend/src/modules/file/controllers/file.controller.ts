import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags
} from '@nestjs/swagger'
import { FileInterceptor } from '@nestjs/platform-express'
import { AccessTokenGuard } from '@common/guards'
import { UploadFileDto, UploadPhotoOutputDto } from '../dto/file.dto'
import { AllExceptionsFilter } from '@common/filters'
import { ResponseInterceptor } from '@common/interceptors'
import { FileService } from '../services/file.service'

const moduleName = 'file'

@ApiTags(moduleName)
@Controller(moduleName)
@UseFilters(AllExceptionsFilter)
@UseInterceptors(ResponseInterceptor)
@ApiBearerAuth('JWT-auth')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @ApiOperation({ summary: 'Upload ảnh lên IPFS' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadFileDto })
  @UseGuards(AccessTokenGuard)
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  async createPhoto(
    @UploadedFile() file: Express.Multer.File
  ): Promise<UploadPhotoOutputDto> {
    return this.fileService.createPhoto(file)
  }
}
