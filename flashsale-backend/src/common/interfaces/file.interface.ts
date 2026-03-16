export interface IUploadOutput {
  fileUrl: string
  uploadHash: string
}

export interface IFile {
  name?: string
  fieldname: string
  originalname: string
  encoding: string
  mimetype: string
  buffer: any
  size: number
}

/**
 * File upload input interface
 */
export interface IFileBuffer {
  originalname: string
  mimetype: string
  buffer: Buffer
  size: number
}

/**
 * Upload result interface
 */
export interface IUploadResult {
  fileUrl: string
  uploadHashBackup: string
  storageProvider: string
  fileObjectId?: string
  blobId?: string
}

/**
 * Compression result interface
 */
export interface ICompressionResult {
  compressed: Buffer
  isCompressed: boolean
  originalSize: number
  compressedSize: number
}
