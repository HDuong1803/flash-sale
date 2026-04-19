import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common'
import { FulfillmentStatus, Prisma, QcStatus } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'
import { RabbitMQService } from '@infrastructure/rabbitmq/rabbitmq.service'
import { QUEUE_NAMES } from '@infrastructure/rabbitmq/rabbitmq.constants'
import {
  QcCheckpointWithInspector,
  QcRepository,
  QcChecklistItem
} from '../repositories/qc.repository'
import { FulfillmentRepository } from '../repositories/fulfillment.repository'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QcPassInput {
  checklist: QcChecklistItem[]
  notes?: string | null
  photoUrls?: string[]
  weightGrams?: number
  dimensionsCm?: { l: number; w: number; h: number }
}

export interface QcFailInput {
  failReason: string
  checklist: QcChecklistItem[]
  notes?: string | null
  photoUrls?: string[]
}

export interface CreateQcInput {
  orderId: string
  inspectorId: string
  checklist?: QcChecklistItem[]
}

export interface QcReworkInput {
  note?: string
}

/**
 * QcService — Logic nghiệp vụ cho QC station.
 *
 * Flow:
 * 1. QC inspector nhận order → createQcCheckpoint() tạo checkpoint
 * 2. Inspector kiểm tra → passQc() hoặc failQc()
 * 3. Nếu pass → publish job vào `fulfillment.label` queue → FulfillmentWorker xử lý label
 * 4. Nếu fail → FulfillmentOrder status = EXCEPTION, chờ rework
 * 5. Sau rework → inspector có thể passQc() lại
 *
 * Design:
 * - QC không gọi EasyPost trực tiếp — delegate sang FulfillmentWorker async
 * - Không block QC HTTP response chờ label booking
 * - Idempotent: pass/fail check current status trước khi update
 */
@Injectable()
export class QcService {
  private readonly logger = new Logger(QcService.name)

  constructor(
    private readonly qcRepo: QcRepository,
    private readonly fulfillmentRepo: FulfillmentRepository,
    private readonly rabbitmq: RabbitMQService,
    private readonly prisma: PrismaService
  ) {}

  async createQcCheckpoint(
    input: CreateQcInput
  ): Promise<QcCheckpointWithInspector> {
    // Idempotency: nếu đã có checkpoint cho order này thì trả về
    const existing = await this.qcRepo.findByOrderId(input.orderId)
    if (existing) return existing

    // Verify fulfillment order tồn tại
    const fulfillment = await this.fulfillmentRepo.findByOrderId(input.orderId)
    if (!fulfillment) {
      throw new NotFoundException(
        `Fulfillment order không tồn tại cho orderId=${input.orderId}`
      )
    }

    const defaultChecklist: QcChecklistItem[] = input.checklist ?? [
      { key: 'item_count', label: 'Số lượng sản phẩm đúng', passed: null },
      { key: 'packaging', label: 'Đóng gói nguyên vẹn', passed: null },
      { key: 'label_match', label: 'Label khớp với đơn hàng', passed: null },
      { key: 'no_damage', label: 'Sản phẩm không bị hỏng hóc', passed: null }
    ]

    await this.qcRepo.create({
      orderId: input.orderId,
      inspectorId: input.inspectorId,
      checklist: defaultChecklist
    })

    const created = await this.qcRepo.findByOrderId(input.orderId)
    if (!created) throw new Error('Failed to create QC checkpoint')
    return created
  }

  async passQc(
    orderId: string,
    input: QcPassInput
  ): Promise<QcCheckpointWithInspector> {
    const checkpoint = await this.qcRepo.findByOrderId(orderId)
    if (!checkpoint) {
      throw new NotFoundException(
        `QC checkpoint không tồn tại cho orderId=${orderId}`
      )
    }

    if (checkpoint.status === QcStatus.PASSED) {
      this.logger.warn(`QC already passed for orderId=${orderId}`)
      return checkpoint
    }

    if (
      checkpoint.status !== QcStatus.PENDING &&
      checkpoint.status !== QcStatus.REWORK
    ) {
      throw new BadRequestException(
        `Không thể pass QC từ trạng thái ${checkpoint.status}`
      )
    }

    // Verify tất cả checklist items đã được đánh dấu passed
    const allPassed = input.checklist.every(item => item.passed === true)
    if (!allPassed) {
      throw new BadRequestException(
        'Tất cả checklist items phải được đánh dấu passed trước khi QC pass'
      )
    }

    const updated = await this.qcRepo.markPassed(checkpoint.id, {
      checklist: input.checklist,
      notes: input.notes,
      photoUrls: input.photoUrls
    })

    this.logger.log(`QC passed for orderId=${orderId}`)

    // Publish async label booking job — FulfillmentWorker sẽ xử lý
    await this.publishLabelJob(orderId, input.weightGrams, input.dimensionsCm)

    const result = await this.qcRepo.findById(updated.id)
    if (!result) throw new Error('Failed to fetch updated QC checkpoint')
    return result
  }

  async failQc(
    orderId: string,
    input: QcFailInput
  ): Promise<QcCheckpointWithInspector> {
    const checkpoint = await this.qcRepo.findByOrderId(orderId)
    if (!checkpoint) {
      throw new NotFoundException(
        `QC checkpoint không tồn tại cho orderId=${orderId}`
      )
    }

    if (checkpoint.status === QcStatus.FAILED) {
      this.logger.warn(`QC already failed for orderId=${orderId}`)
      return checkpoint
    }

    if (
      checkpoint.status !== QcStatus.PENDING &&
      checkpoint.status !== QcStatus.REWORK
    ) {
      throw new BadRequestException(
        `Không thể fail QC từ trạng thái ${checkpoint.status}`
      )
    }

    if (!input.failReason.trim()) {
      throw new BadRequestException('Lý do không đạt không được để trống')
    }

    await this.qcRepo.markFailed(checkpoint.id, {
      failReason: input.failReason,
      checklist: input.checklist,
      notes: input.notes,
      photoUrls: input.photoUrls
    })

    // Cập nhật FulfillmentOrder status thành EXCEPTION
    const fulfillment = await this.fulfillmentRepo.findByOrderId(orderId)
    if (fulfillment) {
      await this.fulfillmentRepo.updateStatus(
        fulfillment.id,
        FulfillmentStatus.EXCEPTION,
        {
          exceptionReason: `QC Failed: ${input.failReason}`,
          exceptionAt: new Date()
        }
      )
    }

    this.logger.warn(`QC failed for orderId=${orderId}: ${input.failReason}`)

    const result = await this.qcRepo.findByOrderId(orderId)
    if (!result) throw new Error('Failed to fetch updated QC checkpoint')
    return result
  }

  async reworkQc(
    orderId: string,
    input: QcReworkInput
  ): Promise<QcCheckpointWithInspector> {
    const checkpoint = await this.qcRepo.findByOrderId(orderId)
    if (!checkpoint) {
      throw new NotFoundException(
        `QC checkpoint không tồn tại cho orderId=${orderId}`
      )
    }

    if (checkpoint.status === QcStatus.REWORK) {
      await this.reconcileFulfillmentForRework(orderId, input.note)
      const current = await this.qcRepo.findByOrderId(orderId)
      if (!current) {
        throw new Error('Failed to fetch updated QC checkpoint')
      }
      return current
    }

    if (checkpoint.status !== QcStatus.FAILED) {
      throw new BadRequestException(
        `Chỉ có thể chuyển sang REWORK từ trạng thái FAILED, hiện tại=${checkpoint.status}`
      )
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const transition = await tx.qcCheckpoint.updateMany({
        where: {
          id: checkpoint.id,
          status: QcStatus.FAILED
        },
        data: {
          status: QcStatus.REWORK
        }
      })

      if (transition.count === 0) {
        return
      }

      await tx.fulfillmentOrder.updateMany({
        where: { orderId },
        data: {
          fulfillStatus: FulfillmentStatus.AWAITING,
          exceptionReason:
            input.note ?? 'Đã chuyển REWORK để kiểm tra lại trước khi giao',
          exceptionAt: null
        }
      })
    })

    await this.reconcileFulfillmentForRework(orderId, input.note)

    this.logger.log(`QC moved to REWORK for orderId=${orderId}`)

    const result = await this.qcRepo.findByOrderId(orderId)
    if (!result) throw new Error('Failed to fetch updated QC checkpoint')
    return result
  }

  async getQcStatus(
    orderId: string
  ): Promise<QcCheckpointWithInspector | null> {
    return this.qcRepo.findByOrderId(orderId)
  }

  async listQcCheckpoints(params: {
    status?: QcStatus
    limit: number
    offset: number
  }): Promise<{ items: QcCheckpointWithInspector[]; total: number }> {
    return this.qcRepo.findAllWithPagination(params)
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async publishLabelJob(
    orderId: string,
    weightGrams?: number,
    dimensionsCm?: { l: number; w: number; h: number }
  ): Promise<void> {
    try {
      await this.rabbitmq.publish(QUEUE_NAMES.FULFILLMENT_LABEL, {
        orderId,
        weightGrams,
        dimensionsCm,
        timestamp: Date.now()
      })
      this.logger.log(`Label job published for orderId=${orderId}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `Failed to publish label job for orderId=${orderId}: ${message}. ` +
          'Label booking will not proceed automatically.'
      )
      // Không throw — QC pass đã thành công, chỉ là label booking bị delay
    }
  }

  private async reconcileFulfillmentForRework(
    orderId: string,
    note?: string
  ): Promise<void> {
    const fulfillment = await this.fulfillmentRepo.findByOrderId(orderId)
    if (!fulfillment) {
      return
    }

    if (
      fulfillment.fulfillStatus === FulfillmentStatus.AWAITING &&
      !fulfillment.exceptionAt
    ) {
      return
    }

    await this.fulfillmentRepo.updateStatus(
      fulfillment.id,
      FulfillmentStatus.AWAITING,
      {
        exceptionReason:
          note ?? 'Đã chuyển REWORK để kiểm tra lại trước khi giao',
        exceptionAt: null
      }
    )
  }
}
