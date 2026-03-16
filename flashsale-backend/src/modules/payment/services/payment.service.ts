import { Injectable, Logger } from '@nestjs/common'
import { PaymentRepository } from '../repositories/payment.repository'
import { SagaCoordinatorService } from './saga-coordinator.service'
import { PaymentWebhookDto } from '../dto/payment.dto'

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name)

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly saga: SagaCoordinatorService
  ) {}

  async handleWebhook(dto: PaymentWebhookDto): Promise<{ received: boolean }> {
    const payment = await this.paymentRepository.findById(dto.paymentId)
    if (!payment) {
      this.logger.warn(`Webhook for unknown paymentId=${dto.paymentId}`)
      return { received: false }
    }

    // Idempotency: skip if already processed
    if (payment.status !== 'PENDING') {
      this.logger.log(
        `Webhook duplicate for paymentId=${dto.paymentId}, status=${payment.status}`
      )
      return { received: true }
    }

    if (dto.status === 'success') {
      await this.saga.confirmPayment(dto.paymentId, dto.transactionId)
    } else {
      const reservationId = payment.reservationId
      if (reservationId) {
        await this.saga.rollbackPayment(dto.paymentId, reservationId)
      }
    }

    return { received: true }
  }
}
