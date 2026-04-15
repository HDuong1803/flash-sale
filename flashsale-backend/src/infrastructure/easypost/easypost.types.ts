/**
 * EasyPost API v2 type definitions.
 *
 * Chỉ khai báo các fields thực sự dùng trong codebase này.
 * EasyPost trả về nhiều field hơn nhưng không cần type toàn bộ.
 */

// ─── Address ──────────────────────────────────────────────────────────────────

export interface EasyPostAddressInput {
  name?: string
  company?: string
  street1: string
  street2?: string
  city?: string
  state?: string
  zip?: string
  country?: string // ISO 3166-1 alpha-2, default "US"
  phone?: string
  email?: string
  /** Nếu true, EasyPost sẽ verify địa chỉ có thể giao hàng không */
  verify?: boolean
}

export interface EasyPostAddress {
  id: string
  object: 'Address'
  name?: string
  company?: string
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  country: string
  phone?: string
  email?: string
  verifications?: {
    delivery?: {
      success: boolean
      errors?: Array<{ message: string; suggestion?: string }>
    }
  }
}

// ─── Parcel ───────────────────────────────────────────────────────────────────

export interface EasyPostParcel {
  /** oz */
  weight: number
  /** inches */
  length?: number
  width?: number
  height?: number
  predefined_package?: string // "FlatRatePadded", "MediumFlatRateBox", etc.
}

// ─── Rate ─────────────────────────────────────────────────────────────────────

export interface EasyPostRate {
  id: string
  object: 'Rate'
  carrier: string // "USPS", "UPS", "FedEx"
  service: string // "Priority", "Ground", etc.
  rate: string // decimal string, e.g. "6.50"
  currency: string
  delivery_days?: number
  est_delivery_date?: string // ISO date
  retail_rate?: string
  list_rate?: string
}

// ─── Shipment ─────────────────────────────────────────────────────────────────

export interface EasyPostShipment {
  id: string
  object: 'Shipment'
  tracking_code?: string
  status: string
  rates: EasyPostRate[]
  selected_rate?: EasyPostRate
  postage_label?: {
    label_url: string
    label_pdf_url?: string
    label_zpl_url?: string
  }
  tracker?: {
    id: string
    tracking_code: string
    public_url: string
  }
}

// ─── Tracking ─────────────────────────────────────────────────────────────────

export interface EasyPostTrackingDetail {
  message: string
  status: string // "pre_transit" | "in_transit" | "out_for_delivery" | "delivered" | "available_for_pickup" | "return_to_sender" | "failure" | "unknown" | "error"
  datetime: string // ISO
  tracking_location?: {
    city?: string
    state?: string
    country?: string
    zip?: string
  }
}

// ─── Webhook Event ────────────────────────────────────────────────────────────

export interface EasyPostWebhookPayload {
  id: string
  object: 'Event'
  /** e.g. "tracker.updated" */
  description: string
  mode: 'test' | 'production'
  result: {
    id: string
    object: string
    tracking_code?: string
    status?: string // FulfillmentStatus mapped from this
    tracking_details?: EasyPostTrackingDetail[]
    est_delivery_date?: string
  }
  created_at: string
  updated_at: string
}

// ─── Error ────────────────────────────────────────────────────────────────────

export interface EasyPostApiError {
  error: {
    code: string
    message: string
    errors?: Array<{ message: string; field?: string }>
  }
}

export class EasyPostError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'EasyPostError'
  }
}
