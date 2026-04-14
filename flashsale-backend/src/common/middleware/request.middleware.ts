import { Injectable, NestMiddleware } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'
import { RequestInterface } from '../../@types/request.interface'
import { GeneratorService } from '..'

@Injectable()
export class RequestMiddleware implements NestMiddleware {
  constructor(private readonly generateService: GeneratorService) {}
  use(req: Request, res: Response, next: NextFunction) {
    const generatedId = this.generateService.cuid()
    // Add the ID to the request object
    ;(req as RequestInterface).id = generatedId
    next()
  }
}
