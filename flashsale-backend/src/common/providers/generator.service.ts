import { Injectable } from '@nestjs/common'
import { createId } from '@paralleldrive/cuid2'
import { createHash, randomBytes } from 'crypto'

@Injectable()
export class GeneratorService {
  public cuid(): string {
    return createId()
  }

  public createRefreshTokenId(): string {
    return this.cuid()
  }

  public fileName(imageBuffer: string): string {
    return createHash('sha256').update(imageBuffer).digest('hex')
  }

  public generateVerificationCode(): string {
    return Math.floor(1000 + Math.random() * 9000).toString()
  }

  public generateSlug(tokenId: string): string {
    return createHash('sha256')
      .update(tokenId)
      .digest('hex')
      .slice(0, 14)
      .toLowerCase()
  }

  public generateRandomString(length: number): string {
    return randomBytes(length)
      .toString('hex')
      .substring(0, length)
      .toLowerCase()
  }

  public generateRandomNonce(length = 6): string {
    return randomBytes(32).toString('hex').substring(0, length).toUpperCase()
  }

  public generateRandomVerificationCode = (length: number): string => {
    const charset = '0123456789'
    let code = ''
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length)
      code += charset.charAt(randomIndex)
    }
    return code
  }
}
