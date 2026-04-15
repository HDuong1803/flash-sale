import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { Request } from 'express'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { QcStatus } from '@prisma/client'
import { AccessTokenGuard } from '@common/guards/access-token.guard'
import { RolesGuard } from '@common/guards/roles.guard'
import { Roles } from '@common/decorators/roles.decorator'
import { ResponseInterceptor } from '@common/interceptors/response.interceptor'
import { QcService } from '../services/qc.service'
import {
  CreateQcCheckpointDto,
  QcCheckpointResponseDto,
  QcFailDto,
  QcListQueryDto,
  QcListResponseDto,
  QcPassDto
} from '../dto/qc.dto'
import { QcCheckpointWithInspector } from '../repositories/qc.repository'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapQcResponse(qc: QcCheckpointWithInspector): QcCheckpointResponseDto {
  return {
    id: qc.id,
    orderId: qc.orderId,
    status: qc.status,
    inspector: qc.inspector,
    checklist: (
      qc.checklist as Array<{
        key: string
        label: string
        passed: boolean | null
      }>
    ).map(item => ({
      key: item.key,
      label: item.label,
      passed: item.passed
    })),
    failReason: qc.failReason,
    notes: qc.notes,
    photoUrls: qc.photoUrls,
    passedAt: qc.passedAt?.toISOString() ?? null,
    failedAt: qc.failedAt?.toISOString() ?? null,
    createdAt: qc.createdAt.toISOString()
  }
}

const moduleName = 'fulfillment/qc'

@ApiTags('fulfillment-qc')
@Controller(moduleName)
@UseInterceptors(ResponseInterceptor)
@ApiBearerAuth('JWT-auth')
@UseGuards(AccessTokenGuard, RolesGuard)
export class QcController {
  constructor(private readonly qcService: QcService) {}

  // ─── GET qc/:orderId ─────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Lấy trạng thái QC của một đơn hàng' })
  @ApiParam({ name: 'orderId', description: 'ID đơn hàng' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Thông tin QC checkpoint',
    type: QcCheckpointResponseDto
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Chưa có QC checkpoint'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @Roles('ADMIN', 'MERCHANT')
  @Get(':orderId')
  @HttpCode(HttpStatus.OK)
  async getQcStatus(
    @Param('orderId') orderId: string
  ): Promise<QcCheckpointResponseDto | null> {
    const qc = await this.qcService.getQcStatus(orderId)
    if (!qc) return null
    return mapQcResponse(qc)
  }

  // ─── POST qc/:orderId/init ───────────────────────────────────────────────

  @ApiOperation({
    summary: 'Khởi tạo QC checkpoint cho đơn hàng (ADMIN/MERCHANT)'
  })
  @ApiParam({ name: 'orderId', description: 'ID đơn hàng' })
  @ApiBody({ type: CreateQcCheckpointDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'QC checkpoint đã tạo',
    type: QcCheckpointResponseDto
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Fulfillment order không tồn tại'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @Roles('ADMIN', 'MERCHANT')
  @Post(':orderId/init')
  @HttpCode(HttpStatus.CREATED)
  async initQc(
    @Param('orderId') orderId: string,
    @Req() req: Request,
    @Body() dto: CreateQcCheckpointDto
  ): Promise<QcCheckpointResponseDto> {
    const inspectorId = (req.user as { sub: string }).sub
    const qc = await this.qcService.createQcCheckpoint({
      orderId,
      inspectorId,
      checklist: dto.checklist
    })
    return mapQcResponse(qc)
  }

  // ─── POST qc/:orderId/pass ───────────────────────────────────────────────

  @ApiOperation({
    summary: 'Đánh dấu QC pass và publish async label booking (ADMIN/MERCHANT)'
  })
  @ApiParam({ name: 'orderId', description: 'ID đơn hàng' })
  @ApiBody({ type: QcPassDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'QC đã pass, label booking được queue',
    type: QcCheckpointResponseDto
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Checklist chưa hoàn thành'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Checkpoint không tồn tại'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @Roles('ADMIN', 'MERCHANT')
  @Post(':orderId/pass')
  @HttpCode(HttpStatus.OK)
  async passQc(
    @Param('orderId') orderId: string,
    @Body() dto: QcPassDto
  ): Promise<QcCheckpointResponseDto> {
    const qc = await this.qcService.passQc(orderId, {
      checklist: dto.checklist,
      notes: dto.notes,
      photoUrls: dto.photoUrls,
      weightGrams: dto.weightGrams,
      dimensionsCm: dto.dimensionsCm
    })
    return mapQcResponse(qc)
  }

  // ─── POST qc/:orderId/fail ───────────────────────────────────────────────

  @ApiOperation({ summary: 'Đánh dấu QC fail (ADMIN/MERCHANT)' })
  @ApiParam({ name: 'orderId', description: 'ID đơn hàng' })
  @ApiBody({ type: QcFailDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'QC đã fail, fulfillment status cập nhật EXCEPTION',
    type: QcCheckpointResponseDto
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Thiếu failReason'
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Checkpoint không tồn tại'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @Roles('ADMIN', 'MERCHANT')
  @Post(':orderId/fail')
  @HttpCode(HttpStatus.OK)
  async failQc(
    @Param('orderId') orderId: string,
    @Body() dto: QcFailDto
  ): Promise<QcCheckpointResponseDto> {
    const qc = await this.qcService.failQc(orderId, {
      failReason: dto.failReason,
      checklist: dto.checklist,
      notes: dto.notes,
      photoUrls: dto.photoUrls
    })
    return mapQcResponse(qc)
  }

  // ─── GET qc (Admin list) ─────────────────────────────────────────────────

  @ApiOperation({ summary: 'Danh sách tất cả QC checkpoints (ADMIN)' })
  @ApiQuery({ name: 'status', enum: QcStatus, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'offset', type: Number, required: false })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách QC checkpoints',
    type: QcListResponseDto
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập'
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Chỉ ADMIN' })
  @Roles('ADMIN')
  @Get()
  @HttpCode(HttpStatus.OK)
  async listQcCheckpoints(
    @Query() query: QcListQueryDto
  ): Promise<QcListResponseDto> {
    const limit = query.limit ?? 20
    const offset = query.offset ?? 0

    const { items, total } = await this.qcService.listQcCheckpoints({
      status: query.status,
      limit,
      offset
    })

    return {
      items: items.map(mapQcResponse),
      total
    }
  }
}
