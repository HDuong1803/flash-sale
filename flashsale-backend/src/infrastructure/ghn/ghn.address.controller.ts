import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  Query,
  UseInterceptors
} from '@nestjs/common'
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ResponseInterceptor } from '@common/interceptors/response.interceptor'
import { GHNAddressService } from './ghn.address.service'

@ApiTags('address')
@Controller('address')
@UseInterceptors(ResponseInterceptor)
export class GHNAddressController {
  constructor(private readonly ghnAddress: GHNAddressService) {}

  @ApiOperation({ summary: 'Lấy danh sách tỉnh/thành phố' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách tỉnh/thành phố'
  })
  @Get('provinces')
  @HttpCode(HttpStatus.OK)
  async getProvinces() {
    return this.ghnAddress.getProvinces()
  }

  @ApiOperation({ summary: 'Lấy danh sách quận/huyện theo tỉnh' })
  @ApiQuery({
    name: 'provinceId',
    type: Number,
    description: 'ID tỉnh/thành phố'
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Danh sách quận/huyện' })
  @Get('districts')
  @HttpCode(HttpStatus.OK)
  async getDistricts(@Query('provinceId', ParseIntPipe) provinceId: number) {
    return this.ghnAddress.getDistricts(provinceId)
  }

  @ApiOperation({ summary: 'Lấy danh sách phường/xã theo quận' })
  @ApiQuery({ name: 'districtId', type: Number, description: 'ID quận/huyện' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Danh sách phường/xã' })
  @Get('wards')
  @HttpCode(HttpStatus.OK)
  async getWards(@Query('districtId', ParseIntPipe) districtId: number) {
    return this.ghnAddress.getWards(districtId)
  }
}
