import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  FileTypeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
import { ProductService } from '../services/product.service'
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  ProductResponseDto,
  ProductDetailResponseDto,
  InventoryResponseDto
} from '../dto/product.dto'

const moduleName = 'products'

/** 5 MB limit per image */
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = /^image\/(jpeg|png|webp|gif)$/

const imageFilePipe = new ParseFilePipe({
  validators: [
    new MaxFileSizeValidator({ maxSize: MAX_IMAGE_SIZE_BYTES }),
    new FileTypeValidator({ fileType: ALLOWED_IMAGE_TYPES })
  ],
  fileIsRequired: false
})

@ApiTags(moduleName)
@Controller(moduleName)
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('MERCHANT')
@UseInterceptors(ResponseInterceptor)
@ApiBearerAuth('JWT-auth')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @ApiOperation({ summary: 'Tạo sản phẩm mới (bắt buộc ít nhất 3 ảnh, tối đa 10 ảnh)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'iPhone 15 Pro Max' },
        description: { type: 'string' },
        category: { type: 'string', example: 'Điện thoại' },
        originalPrice: { type: 'number', example: 34990000 },
        inventory: { type: 'number', example: 100 },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Ảnh sản phẩm (bắt buộc ít nhất 3 file, tối đa 10 file, mỗi file tối đa 5MB)'
        }
      },
      required: ['name', 'originalPrice', 'inventory', 'files']
    }
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: ProductResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Dữ liệu không hợp lệ hoặc chưa đủ 3 ảnh'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Merchant chưa được duyệt'
  })
  @Post()
  @UseInterceptors(FilesInterceptor('files', 10))
  async create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateProductDto,
    @UploadedFiles(imageFilePipe) files?: Express.Multer.File[]
  ): Promise<ProductResponseDto> {
    return this.productService.create(user.userId, dto, files ?? []) as unknown as ProductResponseDto
  }

  @ApiOperation({ summary: 'Danh sách sản phẩm của merchant' })
  @ApiResponse({ status: HttpStatus.OK, type: [ProductResponseDto] })
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @CurrentUser() user: { userId: string },
    @Query() query: ProductQueryDto
  ): Promise<ProductResponseDto[]> {
    return this.productService.findAll(user.userId, query) as unknown as ProductResponseDto[]
  }

  @ApiOperation({ summary: 'Chi tiết sản phẩm kèm danh sách chiến dịch' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: HttpStatus.OK, type: ProductDetailResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Sản phẩm không tồn tại' })
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getById(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string
  ): Promise<ProductDetailResponseDto> {
    return this.productService.getById(user.userId, id) as unknown as ProductDetailResponseDto
  }

  @ApiOperation({ summary: 'Xoá sản phẩm (soft delete)' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Đã xoá sản phẩm' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Sản phẩm đang tham gia chiến dịch' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Sản phẩm không tồn tại' })
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string
  ): Promise<void> {
    return this.productService.delete(user.userId, id)
  }

  @ApiOperation({
    summary: 'Cập nhật thông tin sản phẩm + thêm ảnh mới',
    description: 'Thêm ảnh mới vào sản phẩm (không xóa ảnh cũ). Sản phẩm phải luôn có ít nhất 3 ảnh.'
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        category: { type: 'string' },
        originalPrice: { type: 'number' },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Ảnh mới thêm vào (không xóa ảnh cũ). Tổng ảnh sau khi thêm phải >= 3'
        }
      }
    }
  })
  @ApiResponse({ status: HttpStatus.OK, type: ProductResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Đã đạt tối đa số ảnh cho phép hoặc tổng ảnh chưa đủ 3'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Sản phẩm không tồn tại'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Không có quyền truy cập'
  })
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FilesInterceptor('files', 10))
  async update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @UploadedFiles(imageFilePipe) files?: Express.Multer.File[]
  ): Promise<ProductResponseDto> {
    return this.productService.update(user.userId, id, dto, files ?? []) as unknown as ProductResponseDto
  }

  @ApiOperation({
    summary: 'Xoá một ảnh khỏi sản phẩm',
    description: 'Chỉ có thể xóa nếu sản phẩm đang có hơn 3 ảnh. Cần thêm ảnh mới trước khi xóa nếu đang có đúng 3 ảnh.'
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiParam({ name: 'imageId', description: 'ProductImage ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Đã xoá ảnh' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Không thể xóa — sản phẩm đang có đúng 3 ảnh (tối thiểu)'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Ảnh không tồn tại'
  })
  @Delete(':id/images/:imageId')
  @HttpCode(HttpStatus.OK)
  async deleteImage(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('imageId') imageId: string
  ): Promise<void> {
    return this.productService.deleteImage(user.userId, id, imageId)
  }

  @ApiOperation({ summary: 'Bật/tắt trạng thái sản phẩm (ACTIVE ↔ INACTIVE)' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: HttpStatus.OK, type: ProductResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Sản phẩm không tồn tại'
  })
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async toggleStatus(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string
  ): Promise<ProductResponseDto> {
    return this.productService.toggleStatus(user.userId, id) as unknown as ProductResponseDto
  }

  @ApiOperation({ summary: 'Lấy thông tin tồn kho sản phẩm' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: HttpStatus.OK, type: InventoryResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Sản phẩm hoặc tồn kho không tồn tại'
  })
  @Get(':id/inventory')
  @HttpCode(HttpStatus.OK)
  async getInventory(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string
  ): Promise<InventoryResponseDto> {
    return this.productService.getInventory(user.userId, id)
  }
}
