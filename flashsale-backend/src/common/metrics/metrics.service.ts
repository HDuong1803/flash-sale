import { Injectable } from '@nestjs/common'

// TODO: Re-enable Prometheus metrics in Session 8 (polish)
@Injectable()
export class MetricsService {}

export const metricsProviders: unknown[] = []
