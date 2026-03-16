import { Injectable } from '@nestjs/common'

// Prometheus metrics — stub (disabled, no-op)
@Injectable()
export class MetricsService {}

export const metricsProviders: unknown[] = []
