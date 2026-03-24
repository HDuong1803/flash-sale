import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { v2 as cloudinary } from 'cloudinary'
import type { UploadApiOptions, UploadApiResponse } from 'cloudinary'

export interface CloudinaryUploadResult {
  /** Optimized delivery URL (auto quality + format) */
  secureUrl: string
  /** Cloudinary public_id — used to delete or transform later */
  publicId: string
}

@Injectable()
export class CloudinaryService implements OnModuleInit {
  private readonly logger = new Logger(CloudinaryService.name)

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const cloudName = this.configService.get<string>('cloudinary.CLOUDINARY_CLOUD_NAME', '')
    const apiKey = this.configService.get<string>('cloudinary.CLOUDINARY_API_KEY', '')
    const apiSecret = this.configService.get<string>('cloudinary.CLOUDINARY_API_SECRET', '')

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    })

    if (!cloudName) {
      this.logger.warn(
        'CLOUDINARY_CLOUD_NAME is not set — image uploads will fail'
      )
    } else {
      this.logger.log(`Cloudinary ready (cloud: ${cloudName})`)
    }
  }

  /**
   * Upload an image buffer to Cloudinary.
   * Returns a CDN URL with auto quality + auto format transformations applied.
   */
  async uploadImage(
    buffer: Buffer,
    options: UploadApiOptions = {}
  ): Promise<CloudinaryUploadResult> {
    const result = await this.uploadStream(buffer, {
      folder: 'flashsale/products',
      resource_type: 'image',
      ...options
    })

    // Build delivery URL with q_auto + f_auto for bandwidth savings
    const optimizedUrl = cloudinary.url(result.public_id, {
      quality: 'auto',
      fetch_format: 'auto',
      secure: true
    })

    return { secureUrl: optimizedUrl, publicId: result.public_id }
  }

  /**
   * Delete an image by its public_id.
   * Called when a product image is replaced or the product is deleted.
   */
  async deleteImage(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.warn(`Failed to delete Cloudinary asset ${publicId}: ${message}`)
    }
  }

  private uploadStream(
    buffer: Buffer,
    options: UploadApiOptions
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error) {
          reject(new Error(`Cloudinary upload failed: ${error.message}`))
        } else {
          resolve(result!)
        }
      })
      stream.end(buffer)
    })
  }
}
