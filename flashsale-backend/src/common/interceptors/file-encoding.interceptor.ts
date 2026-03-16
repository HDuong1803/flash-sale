import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger
} from '@nestjs/common'
import { Observable } from 'rxjs'

/**
 * FileEncodingInterceptor
 *
 * Fixes UTF-8 encoding issue with multipart/form-data file uploads.
 *
 * PROBLEM:
 * - Browser sends filename in UTF-8
 * - HTTP multipart Content-Disposition doesn't mandate UTF-8 (RFC 2183)
 * - Node/Multer reads filename as latin1 by default
 * - Result: UTF-8 bytes interpreted as latin1 → corrupted strings
 *
 * SOLUTION:
 * Convert originalname from latin1 → utf8 immediately after Multer parsing
 *
 * EXAMPLE:
 * Before: "Há»\x87 thá»\x91ng quáº£n lÃ½ há»\x99i viÃªn.pdf"
 * After:  "Hệ thống quản lý hội viên.pdf"
 */
@Injectable()
export class FileEncodingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(FileEncodingInterceptor.name)

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest()

    // Fix single file upload (req.file)
    if (request.file) {
      this.fixFileEncoding(request.file)
    }

    // Fix multiple files upload (req.files)
    if (request.files) {
      if (Array.isArray(request.files)) {
        // FilesInterceptor case: req.files is array
        request.files.forEach((file: Express.Multer.File) => {
          this.fixFileEncoding(file)
        })
      } else {
        // FileFieldsInterceptor case: req.files is object with field names
        Object.keys(request.files).forEach(fieldName => {
          const files = (request.files as any)[fieldName]
          if (Array.isArray(files)) {
            files.forEach((file: Express.Multer.File) => {
              this.fixFileEncoding(file)
            })
          }
        })
      }
    }

    return next.handle()
  }

  /**
   * Convert file.originalname from latin1 to UTF-8
   * This is a REQUIRED fix due to Node/Multer's default latin1 interpretation
   */
  private fixFileEncoding(file: Express.Multer.File): void {
    if (!file.originalname) return

    const originalName = file.originalname

    try {
      // Convert latin1 → utf8
      // This reverses the corruption: latin1(utf8_bytes) → utf8
      file.originalname = Buffer.from(originalName, 'latin1').toString('utf8')

      // Log only if encoding was actually fixed (detectable change)
      if (originalName !== file.originalname) {
        this.logger.debug(
          `Fixed filename encoding: "${originalName}" → "${file.originalname}"`
        )
      }
    } catch (error) {
      // Fallback: keep original if conversion fails
      this.logger.warn(
        `Failed to fix encoding for filename: ${originalName}`,
        error
      )
      file.originalname = originalName
    }
  }
}
