import { Injectable } from '@nestjs/common'
import { Campaign, CampaignStatus } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

export type CampaignWithActivationData = Campaign & {
  campaignProducts: Array<{ id: string; saleQuantity: number }>
  preRegistrations: Array<{ customerId: string }>
}

export type CampaignWithCloseData = Campaign & {
  campaignProducts: Array<{ id: string }>
}

export type CampaignWithReminders = Campaign & {
  preRegistrations: Array<{
    id: string
    customerId: string
    reminderSent: boolean
  }>
}

@Injectable()
export class SchedulerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCampaignsToActivate(): Promise<CampaignWithActivationData[]> {
    return this.prisma.campaign.findMany({
      where: {
        status: CampaignStatus.APPROVED,
        startTime: { lte: new Date() }
      },
      include: {
        campaignProducts: { select: { id: true, saleQuantity: true } },
        preRegistrations: { select: { customerId: true } }
      }
    }) as Promise<CampaignWithActivationData[]>
  }

  async findCampaignsToClose(): Promise<CampaignWithCloseData[]> {
    return this.prisma.campaign.findMany({
      where: { status: CampaignStatus.ACTIVE, endTime: { lte: new Date() } },
      include: { campaignProducts: { select: { id: true } } }
    }) as Promise<CampaignWithCloseData[]>
  }

  async findCampaignsForReminders(): Promise<CampaignWithReminders[]> {
    const now = new Date()
    const fifteenMinutesFromNow = new Date(Date.now() + 15 * 60 * 1000)

    return this.prisma.campaign.findMany({
      where: {
        status: CampaignStatus.APPROVED,
        startTime: { gte: now, lte: fifteenMinutesFromNow }
      },
      include: {
        preRegistrations: {
          where: { reminderSent: false },
          select: { id: true, customerId: true, reminderSent: true }
        }
      }
    }) as Promise<CampaignWithReminders[]>
  }

  async findActiveCampaignProducts(): Promise<Array<{ id: string }>> {
    const campaigns = await this.prisma.campaign.findMany({
      where: { status: CampaignStatus.ACTIVE },
      include: { campaignProducts: { select: { id: true } } }
    })
    return campaigns.flatMap(c => c.campaignProducts)
  }

  async updateCampaignStatus(
    id: string,
    status: CampaignStatus
  ): Promise<void> {
    await this.prisma.campaign.update({ where: { id }, data: { status } })
  }

  async updateCampaignProductRemaining(
    id: string,
    remaining: number
  ): Promise<void> {
    await this.prisma.campaignProduct.update({
      where: { id },
      data: { remainingQuantity: remaining }
    })
  }

  async markReminderSent(preRegistrationId: string): Promise<void> {
    await this.prisma.preRegistration.update({
      where: { id: preRegistrationId },
      data: { reminderSent: true }
    })
  }
}
