import axios from 'axios'
import FormData from 'form-data'
import { IFile, IUploadOutput } from '@common/interfaces'

export async function uploadToIPFS(file: IFile): Promise<IUploadOutput> {
  if (!file) return null

  const formData = new FormData()
  formData.append('file', file.buffer, {
    filename: file.originalname,
    contentType: file.mimetype
  })

  const metadata = JSON.stringify({
    name: file.originalname
  })
  const options = JSON.stringify({
    cidVersion: 1
  })

  formData.append('pinataMetadata', metadata)
  formData.append('pinataOptions', options)

  try {
    const response = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      formData,
      {
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: {
          'Content-Type': `multipart/form-data; boundary=${formData.getBoundary()}`,
          pinata_api_key: process.env.PINATA_API_KEY,
          pinata_secret_api_key: process.env.PINATA_SECRET_API_KEY
        }
      }
    )

    const ipfsHash = response.data.IpfsHash
    return {
      fileUrl: `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
      uploadHash: ipfsHash
    }
  } catch (error: any) {
    throw new Error('Upload to IPFS via Pinata failed')
  }
}
