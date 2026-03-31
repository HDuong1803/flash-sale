import { Injectable } from '@nestjs/common'
import {
  CampaignRescheduleRequest,
  RescheduleRequestStatus,
  RescheduleRequestType,
  CampaignStatus
} from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

export type RescheduleRequestWithDetails = CampaignRescheduleRequest & {
  campaign: {
    id: string
    name: string
    startTime: Date
    status: CampaignStatus
    merchant: {
      id: string
      businessName: string
      userId: string
      user: { email: string; fullName: string }
    }
    preRegistrations: Array<{
      customer: { id: string; email: string; fullName: string }
    }>
  }
}

@Injectable()
export class RescheduleRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    campaignId: string
    requestedBy: string
    requestType: RescheduleRequestType
    newStartTime: Date
    expiresAt: Date
    note?: string
  }): Promise<CampaignRescheduleRequest> {
    return this.prisma.campaignRescheduleRequest.create({
      data: {
        campaignId: data.campaignId,
        requestedBy: data.requestedBy,
        requestType: data.requestType,
        newStartTime: data.newStartTime,
        status:
          data.requestType === RescheduleRequestType.ADMIN_FORCE
            ? RescheduleRequestStatus.PENDING_MERCHANT
            : RescheduleRequestStatus.PENDING_ADMIN,
        expiresAt: data.expiresAt,
        note: data.note
      }
    })
  }

  async findById(id: string): Promise<CampaignRescheduleRequest | null> {
    return this.prisma.campaignRescheduleRequest.findUnique({ where: { id } })
  }

  async findByIdWithDetails(
    id: string
  ): Promise<RescheduleRequestWithDetails | null> {
    return this.prisma.campaignRescheduleRequest.findUnique({
      where: { id },
      include: {
        campaign: {
          include: {
            merchant: {
              include: {
                user: { select: { email: true, fullName: true } }
              }
            },
            preRegistrations: {
              include: {
                customer: { select: { id: true, email: true, fullName: true } }
              }
            }
          }
        }
      }
    }) as Promise<RescheduleRequestWithDetails | null>
  }

  async findPendingByMerchantUserId(
    merchantUserId: string
  ): Promise<CampaignRescheduleRequest[]> {
    return this.prisma.campaignRescheduleRequest.findMany({
      where: {
        status: RescheduleRequestStatus.PENDING_MERCHANT,
        requestType: RescheduleRequestType.ADMIN_FORCE,
        campaign: { merchant: { userId: merchantUserId } }
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  async findAll(filters?: {
    status?: RescheduleRequestStatus
    requestType?: RescheduleRequestType
    campaignId?: string
  }): Promise<CampaignRescheduleRequest[]> {
    return this.prisma.campaignRescheduleRequest.findMany({
      where: {
        ...(filters?.status && { status: filters.status }),
        ...(filters?.requestType && { requestType: filters.requestType }),
        ...(filters?.campaignId && { campaignId: filters.campaignId })
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  async hasPendingRequest(campaignId: string): Promise<boolean> {
    const count = await this.prisma.campaignRescheduleRequest.count({
      where: {
        campaignId,
        status: {
          in: [
            RescheduleRequestStatus.PENDING_MERCHANT,
            RescheduleRequestStatus.PENDING_ADMIN
          ]
        }
      }
    })
    return count > 0
  }

  async update(
    id: string,
    data: { status: RescheduleRequestStatus; resolvedAt?: Date }
  ): Promise<CampaignRescheduleRequest> {
    return this.prisma.campaignRescheduleRequest.update({
      where: { id },
      data
    })
  }
}
