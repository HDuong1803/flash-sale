import { Global, Module } from '@nestjs/common'
import { Logger } from './logger'
import {
  CoreService,
  ConfigService,
  GeneratorService,
  EmailService,
  ResendEmailProvider
} from './providers'
import { HttpModule } from '@nestjs/axios'

const services = [
  Logger,
  CoreService,
  ConfigService,
  GeneratorService,
  EmailService,
  ResendEmailProvider
]

@Global()
@Module({
  imports: [HttpModule],
  providers: services,
  exports: services
})
export class CommonModule {}
