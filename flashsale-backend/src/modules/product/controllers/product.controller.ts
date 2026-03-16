import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
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
  InventoryResponseDto
} from '../dto/product.dto'

const moduleName = 'products'

@ApiTags(moduleName)
@Controller(moduleName)
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('MERCHANT')
@UseInterceptors(ResponseInterceptor)
@ApiBearerAuth('JWT-auth')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @ApiOperation({ summary: 'Tạo sản phẩm mới' })
  @ApiBody({ type: CreateProductDto })
  @ApiResponse({ status: HttpStatus.CREATED, type: ProductResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Dữ liệu không hợp lệ'
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Merchant chưa được duyệt'
  })
  @Post()
  async create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateProductDto
  ): Promise<ProductResponseDto> {
    return this.productService.create(user.userId, dto) as any
  }

  @ApiOperation({ summary: 'Danh sách sản phẩm của merchant' })
  @ApiResponse({ status: HttpStatus.OK, type: [ProductResponseDto] })
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @CurrentUser() user: { userId: string },
    @Query() query: ProductQueryDto
  ): Promise<ProductResponseDto[]> {
    return this.productService.findAll(user.userId, query) as any
  }

  @ApiOperation({ summary: 'Cập nhật thông tin sản phẩm' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiBody({ type: UpdateProductDto })
  @ApiResponse({ status: HttpStatus.OK, type: ProductResponseDto })
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
  async update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateProductDto
  ): Promise<ProductResponseDto> {
    return this.productService.update(user.userId, id, dto) as any
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
    return this.productService.toggleStatus(user.userId, id) as any
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
