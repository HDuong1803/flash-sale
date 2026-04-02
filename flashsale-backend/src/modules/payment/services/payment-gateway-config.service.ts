import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { PaymentMethod, Prisma } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

@Injectable()
export class PaymentGatewayConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async listAll() {
    return this.prisma.paymentGatewayConfig.findMany({
      orderBy: [{ enabled: 'desc' }, { isDefault: 'desc' }, { gateway: 'asc' }]
    })
  }

  async listEnabled() {
    return this.prisma.paymentGatewayConfig.findMany({
      where: { enabled: true },
      orderBy: [{ isDefault: 'desc' }, { gateway: 'asc' }]
    })
  }

  async getByGateway(gateway: PaymentMethod) {
    const found = await this.prisma.paymentGatewayConfig.findUnique({
      where: { gateway }
    })
    if (!found) throw new NotFoundException('Gateway config không tồn tại')
    return found
  }

  async ensureGatewayEnabled(gateway: PaymentMethod) {
    const found = await this.getByGateway(gateway)
    if (!found.enabled)
      throw new BadRequestException('Cổng thanh toán chưa được bật')
    return found
  }

  async getDefaultEnabled() {
    const defaultEnabled = await this.prisma.paymentGatewayConfig.findFirst({
      where: { enabled: true, isDefault: true }
    })
    if (defaultEnabled) return defaultEnabled

    const firstEnabled = await this.prisma.paymentGatewayConfig.findFirst({
      where: { enabled: true },
      orderBy: { gateway: 'asc' }
    })
    if (!firstEnabled)
      throw new BadRequestException('Chưa có cổng thanh toán nào được bật')
    return firstEnabled
  }

  async updateGatewayConfig(
    gateway: PaymentMethod,
    data: {
      enabled?: boolean
      isDefault?: boolean
      displayName?: string
      config?: Record<string, unknown> | null
    }
  ) {
    await this.getByGateway(gateway)

    return this.prisma.$transaction(async tx => {
      if (data.isDefault === true) {
        await tx.paymentGatewayConfig.updateMany({
          where: { gateway: { not: gateway } },
          data: { isDefault: false }
        })
      }

      if (data.enabled === false) {
        const countEnabled = await tx.paymentGatewayConfig.count({
          where: { enabled: true, gateway: { not: gateway } }
        })
        if (countEnabled === 0) {
          throw new BadRequestException(
            'Hệ thống phải có ít nhất 1 cổng thanh toán được bật'
          )
        }
      }

      const updated = await tx.paymentGatewayConfig.update({
        where: { gateway },
        data: {
          ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
          ...(data.isDefault !== undefined
            ? { isDefault: data.isDefault }
            : {}),
          ...(data.displayName !== undefined
            ? { displayName: data.displayName }
            : {}),
          ...(data.config !== undefined
            ? {
                config:
                  data.config === null
                    ? Prisma.JsonNull
                    : (data.config as Prisma.InputJsonValue)
              }
            : {})
        }
      })

      if (updated.isDefault && !updated.enabled) {
        throw new BadRequestException(
          'Gateway mặc định phải ở trạng thái enabled'
        )
      }

      return updated
    })
  }
}
