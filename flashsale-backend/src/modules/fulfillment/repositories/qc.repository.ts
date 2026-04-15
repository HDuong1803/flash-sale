import { Injectable } from '@nestjs/common'
import { QcCheckpoint, QcStatus } from '@prisma/client'
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
  inspectorId: string
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
        inspectorId: input.inspectorId,
        checklist: input.checklist,
        status: QcStatus.PENDING
      }
    })
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
}
