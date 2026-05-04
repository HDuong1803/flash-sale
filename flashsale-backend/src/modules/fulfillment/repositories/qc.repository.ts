import { Injectable } from '@nestjs/common'
import { FulfillmentStatus, QcCheckpoint, QcStatus } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

// ─── Types ────────────────────────────────────────────────────────────────────

export type QcChecklistItem = {
  key: string
  label: string
  passed: boolean | null
}

export type QcCheckpointWithInspector = QcCheckpoint & {
  inspector: {
    id: string
    email: string
    fullName: string | null
  } | null
}

export interface CreateQcCheckpointInput {
  orderId: string
  /** null khi auto-created bởi fulfillment flow — inspector claim sau */
  inspectorId: string | null
  checklist: QcChecklistItem[]
}

export interface UpdateQcPassInput {
  checklist: QcChecklistItem[]
  notes?: string | null
  photoUrls?: string[]
}

export interface UpdateQcFailInput {
  failReason: string
  checklist: QcChecklistItem[]
  notes?: string | null
  photoUrls?: string[]
}

@Injectable()
export class QcRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrderId(
    orderId: string
  ): Promise<QcCheckpointWithInspector | null> {
    return this.prisma.qcCheckpoint.findUnique({
      where: { orderId },
      include: {
        inspector: {
          select: { id: true, email: true, fullName: true }
        }
      }
    })
  }

  async findById(id: string): Promise<QcCheckpointWithInspector | null> {
    return this.prisma.qcCheckpoint.findUnique({
      where: { id },
      include: {
        inspector: {
          select: { id: true, email: true, fullName: true }
        }
      }
    })
  }

  async findPendingByInspector(
    inspectorId: string,
    limit = 20
  ): Promise<QcCheckpointWithInspector[]> {
    return this.prisma.qcCheckpoint.findMany({
      where: {
        inspectorId,
        status: { in: [QcStatus.PENDING, QcStatus.REWORK] }
      },
      include: {
        inspector: {
          select: { id: true, email: true, fullName: true }
        }
      },
      orderBy: { createdAt: 'asc' },
      take: limit
    })
  }

  async findAllWithPagination(params: {
    status?: QcStatus
    limit: number
    offset: number
  }): Promise<{ items: QcCheckpointWithInspector[]; total: number }> {
    const where = params.status ? { status: params.status } : {}
    const [items, total] = await this.prisma.$transaction([
      this.prisma.qcCheckpoint.findMany({
        where,
        include: {
          inspector: { select: { id: true, email: true, fullName: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: params.limit,
        skip: params.offset
      }),
      this.prisma.qcCheckpoint.count({ where })
    ])
    return { items, total }
  }

  async create(input: CreateQcCheckpointInput): Promise<QcCheckpoint> {
    return this.prisma.qcCheckpoint.create({
      data: {
        orderId: input.orderId,
        inspectorId: input.inspectorId ?? undefined,
        checklist: input.checklist,
        status: QcStatus.PENDING
      }
    })
  }

  /**
   * autoCreateCheckpointForOrder — Tạo QcCheckpoint chưa có inspector.
   * Gọi tự động từ FulfillmentService sau khi FulfillmentOrder được tạo.
   * Idempotent: nếu đã tồn tại thì return existing.
   */
  async autoCreateCheckpointForOrder(
    orderId: string,
    checklist: QcChecklistItem[]
  ): Promise<QcCheckpoint> {
    const existing = await this.prisma.qcCheckpoint.findUnique({
      where: { orderId }
    })
    if (existing) return existing

    return this.prisma.qcCheckpoint.create({
      data: {
        orderId,
        inspectorId: undefined,
        checklist,
        status: QcStatus.PENDING
      }
    })
  }

  /**
   * claimCheckpoint — Inspector nhận đơn để kiểm định.
   * Chỉ assign nếu inspectorId hiện tại là null (chưa có ai claim).
   * Nếu đã có inspector → trả về checkpoint hiện tại (idempotent).
   */
  async claimCheckpoint(
    checkpointId: string,
    inspectorId: string
  ): Promise<QcCheckpoint> {
    const updated = await this.prisma.qcCheckpoint.updateMany({
      where: { id: checkpointId, inspectorId: null },
      data: { inspectorId }
    })

    if (updated.count === 0) {
      const existing = await this.prisma.qcCheckpoint.findUnique({
        where: { id: checkpointId }
      })
      if (!existing) throw new Error(`QcCheckpoint ${checkpointId} not found`)
      return existing
    }

    const result = await this.prisma.qcCheckpoint.findUnique({
      where: { id: checkpointId }
    })
    if (!result) throw new Error(`QcCheckpoint ${checkpointId} not found`)
    return result
  }

  async markPassed(
    id: string,
    input: UpdateQcPassInput
  ): Promise<QcCheckpoint> {
    return this.prisma.qcCheckpoint.update({
      where: { id },
      data: {
        status: QcStatus.PASSED,
        checklist: input.checklist,
        notes: input.notes,
        photoUrls: input.photoUrls ?? [],
        passedAt: new Date()
      }
    })
  }

  async markFailed(
    id: string,
    input: UpdateQcFailInput
  ): Promise<QcCheckpoint> {
    return this.prisma.qcCheckpoint.update({
      where: { id },
      data: {
        status: QcStatus.FAILED,
        failReason: input.failReason,
        checklist: input.checklist,
        notes: input.notes,
        photoUrls: input.photoUrls ?? [],
        failedAt: new Date()
      }
    })
  }

  async markRework(id: string): Promise<QcCheckpoint> {
    return this.prisma.qcCheckpoint.update({
      where: { id },
      data: { status: QcStatus.REWORK }
    })
  }

  /**
   * markReworkWithFulfillmentReset — Atomic: FAILED → REWORK + FulfillmentOrder → AWAITING.
   *
   * Dùng optimistic locking (updateMany với điều kiện status=FAILED) để tránh
   * race condition nếu có 2 request rework cùng lúc.
   * Nếu transition.count === 0 nghĩa là QC đã được cập nhật bởi request khác → skip.
   */
  async markReworkWithFulfillmentReset(
    checkpointId: string,
    orderId: string,
    note: string
  ): Promise<void> {
    await this.prisma.$transaction(async tx => {
      const transition = await tx.qcCheckpoint.updateMany({
        where: { id: checkpointId, status: QcStatus.FAILED },
        data: { status: QcStatus.REWORK }
      })

      if (transition.count === 0) return

      await tx.fulfillmentOrder.updateMany({
        where: { orderId },
        data: {
          fulfillStatus: FulfillmentStatus.AWAITING,
          exceptionReason: note,
          exceptionAt: null
        }
      })
    })
  }
}
