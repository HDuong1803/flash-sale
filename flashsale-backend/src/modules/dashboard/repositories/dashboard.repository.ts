import { Injectable } from '@nestjs/common'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getCampaignProducts(
    campaignId: string
  ): Promise<
    Array<{ id: string; saleQuantity: number; remainingQuantity: number }>
  > {
    return this.prisma.campaignProduct.findMany({
      where: { campaignId },
      select: { id: true, saleQuantity: true, remainingQuantity: true }
    })
  }

  async countOrdersForCampaign(campaignId: string): Promise<number> {
    return this.prisma.order.count({
      where: { reservation: { campaignProduct: { campaignId } } }
    })
  }
}
