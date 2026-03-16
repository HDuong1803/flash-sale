export interface IUploadJobData {
  fileId: number
  userId: number
  fileBuffer: Buffer
  originalname: string
  mimetype: string
  storageProvider: string
  allowedAddresses?: string[]
  userWalletAddress?: string
  ownerKey?: string
}

export interface IStampExecuteJobData {
  prePairId: number
  userId: number
  userSignature: string
  fullTxBytesBase64: string
}
