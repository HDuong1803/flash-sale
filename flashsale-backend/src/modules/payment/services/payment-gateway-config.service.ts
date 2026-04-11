import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit
} from '@nestjs/common'
import { PaymentMethod, Prisma } from '@prisma/client'
import { PrismaService } from '@infrastructure/prisma/prisma.service'

const DEFAULT_GATEWAYS: Array<{
  gateway: PaymentMethod
  displayName: string
  enabled: boolean
  isDefault: boolean
}> = [
  {
    gateway: PaymentMethod.STRIPE,
    displayName: 'Stripe',
    enabled: true,
    isDefault: true
  }
]

@Injectable()
export class PaymentGatewayConfigService implements OnModuleInit {
  private readonly logger = new Logger(PaymentGatewayConfigService.name)

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    for (const gw of DEFAULT_GATEWAYS) {
      await this.prisma.paymentGatewayConfig.upsert({
        where: { gateway: gw.gateway },
        create: gw,
        update: {}
      })
    }
    this.logger.log('Payment gateway configs initialized')
  }

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

      const updatePayload = {
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
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

      const existing = await tx.paymentGatewayConfig.findUnique({
        where: { gateway }
      })

      const updated = existing
        ? await tx.paymentGatewayConfig.update({
            where: { gateway },
            data: updatePayload
          })
        : await tx.paymentGatewayConfig.create({
            data: {
              gateway,
              displayName: data.displayName ?? gateway,
              enabled: data.enabled ?? false,
              isDefault: data.isDefault ?? false,
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
