/**
 * GHN (Giao Hàng Nhanh) API type definitions.
 *
 * GHN sử dụng địa chỉ có cấu trúc với ID số cho tỉnh/quận/phường.
 * Sandbox base URL: https://dev-online-gateway.ghn.vn/shiip/public-api
 * Production base URL: https://online-gateway.ghn.vn/shiip/public-api
 *
 * Auth headers:
 *   Token: {api_key}
 *   ShopId: {shop_id}
 */

// ─── Address Master Data ───────────────────────────────────────────────────────

export interface GHNProvince {
  ProvinceID: number
  ProvinceName: string
  Code: string
  NameExtension: string[]
  Status: number // 1 = Unlock, 2 = Lock
  CanUpdateCOD: boolean
}

export interface GHNDistrict {
  DistrictID: number
  ProvinceID: number
  DistrictName: string
  Code: string
  Type: number
  SupportType: number
  NameExtension: string[]
  Status: number
  CanUpdateCOD: boolean
}

export interface GHNWard {
  WardCode: string
  DistrictID: number
  WardName: string
  NameExtension: string[]
  Status: number
  CanUpdateCOD: boolean
}

// ─── Shipping Address (Vietnamese structured format) ──────────────────────────

/** Địa chỉ giao hàng VN — sử dụng ID số thay vì free text */
export interface GHNAddressInput {
  /** Tên người nhận */
  to_name: string
  /** Số điện thoại người nhận */
  to_phone: string
  /** Địa chỉ chi tiết (số nhà, tên đường) */
  to_address: string
  /** Mã phường/xã (string, ví dụ "20314") */
  to_ward_code: string
  /** ID quận/huyện (số, ví dụ 1442 = Quận 1 HCM) */
  to_district_id: number
}

/** Địa chỉ kho gửi hàng */
export interface GHNFromAddress {
  from_name: string
  from_phone: string
  from_address: string
  from_ward_name: string
  from_district_name: string
  from_province_name: string
}

// ─── Available Services ────────────────────────────────────────────────────────

export interface GHNAvailableServicesInput {
  /** ID quận/huyện kho gửi */
  from_district: number
  /** ID quận/huyện người nhận */
  to_district: number
}

export interface GHNServiceItem {
  service_id: number
  short_name: string
  service_type_id: number
}

// ─── Calculate Fee ─────────────────────────────────────────────────────────────

export interface GHNCalculateFeeInput {
  service_id: number
  service_type_id: number
  from_district_id: number
  to_district_id: number
  to_ward_code: string
  weight: number // grams
  length?: number // cm
  width?: number // cm
  height?: number // cm
  insurance_value?: number
  cod_failed_amount?: number
  coupon?: string
}

export interface GHNFeeResult {
  /** Phí vận chuyển chính (đồng) */
  total: number
  service_fee: number
  insurance_fee: number
  pick_station_fee: number
  coupon_value: number
  r2s_fee: number
  return_again: number
  document_return: number
  double_check: number
  cod_fee: number
  pick_remote_areas_fee: number
  deliver_remote_areas_fee: number
  cod_failed_fee: number
}

// ─── Order Items ───────────────────────────────────────────────────────────────

export interface GHNOrderItem {
  name: string
  code?: string
  quantity: number
  price?: number
  weight: number // grams
  length?: number // cm
  width?: number // cm
  height?: number // cm
}

// ─── Create Order ─────────────────────────────────────────────────────────────

/** service_type_id: 2 = E-commerce (dịch vụ chuyển phát nhanh), 5 = Traditional */
export type GHNServiceTypeId = 2 | 5

/** payment_type_id: 1 = Shop trả phí (người gửi), 2 = Buyer trả phí (người nhận) */
export type GHNPaymentTypeId = 1 | 2

/** required_note — hướng dẫn khi không giao được */
export type GHNRequiredNote =
  | 'CHOTHUHANG'
  | 'CHOXEMHANGKHONGTHU'
  | 'KHONGCHOXEMHANG'

export interface GHNCreateOrderInput {
  /** Tên người nhận */
  to_name: string
  /** SĐT người nhận */
  to_phone: string
  /** Địa chỉ chi tiết người nhận */
  to_address: string
  /** Mã phường người nhận */
  to_ward_code: string
  /** ID quận người nhận */
  to_district_id: number
  /** Trọng lượng (gram, max 50000) */
  weight: number
  /** Loại dịch vụ: 2 = Express, 5 = Eco */
  service_type_id: GHNServiceTypeId
  /** Ai trả phí: 1 = Shop, 2 = Buyer */
  payment_type_id: GHNPaymentTypeId
  /** Hướng dẫn khi không giao được */
  required_note: GHNRequiredNote
  /** Danh sách sản phẩm */
  items: GHNOrderItem[]
  /** Mã đơn hàng nội bộ (optional, unique, max 50 chars) */
  client_order_code?: string
  /** Tiền thu hộ COD (0 nếu đã thanh toán online) */
  cod_amount?: number
  /** Giá trị khai báo bảo hiểm */
  insurance_value?: number
  /** Mô tả nội dung kiện hàng */
  content?: string
  /** Chiều dài (cm) */
  length?: number
  /** Chiều rộng (cm) */
  width?: number
  /** Chiều cao (cm) */
  height?: number
  /** Ghi chú cho shipper */
  note?: string
  /** SĐT địa chỉ trả hàng */
  return_phone?: string
  /** Địa chỉ trả hàng */
  return_address?: string
  /** ID quận trả hàng */
  return_district_id?: number
  /** Mã phường trả hàng */
  return_ward_code?: string
}

// ─── Order Response ────────────────────────────────────────────────────────────

export interface GHNOrderFee {
  main_service: number
  insurance: number
  station_pu: number
  station_do: number
  return: number
  r2s: number
  coupon: number
}

export interface GHNCreatedOrder {
  /** Mã vận đơn GHN (tracking code) */
  order_code: string
  /** Sort code */
  sort_code: string
  /** Thời gian giao dự kiến (ISO 8601) */
  expected_delivery_time: string
  /** Chi tiết phí */
  fee: GHNOrderFee
  /** Tổng phí (string) */
  total_fee: string
  trans_type: string
  district_encode: string
  ward_encode: string
}

export interface GHNOrderDetail {
  order_code: string
  client_order_code?: string
  status: string
  from_name: string
  from_phone: string
  from_address: string
  from_ward_code: string
  from_district_id: number
  to_name: string
  to_phone: string
  to_address: string
  to_ward_code: string
  to_district_id: number
  weight: number
  length: number
  width: number
  height: number
  service_type_id: number
  service_id: number
  payment_type_id: number
  cod_amount: number
  insurance_value: number
  created_date: string
  updated_date: string
  order_date: string
  finish_date: string | null
  leadtime: string
}

// ─── Cancel Order ─────────────────────────────────────────────────────────────

export interface GHNCancelOrderResult {
  order_code: string
  result: boolean
  message: string
}

// ─── Webhook Payload ──────────────────────────────────────────────────────────

/**
 * GHN Webhook Payload — gửi qua POST khi trạng thái đơn thay đổi.
 *
 * GHN gửi token trong body
 * Verify bằng cách so sánh Token field với GHN_WEBHOOK_TOKEN config.
 */
export interface GHNWebhookPayload {
  /** Mã vận đơn GHN */
  OrderCode: string
  /** Mã đơn hàng nội bộ (client_order_code khi tạo đơn) */
  ClientOrderCode: string
  /** Trạng thái vận đơn GHN */
  Status: string
  /** Thời gian sự kiện (Unix timestamp) */
  Time: number
  /** Mô tả trạng thái */
  Description: string
  /** Lý do (khi fail/exception) */
  Reason: string
  /** Mã lý do */
  ReasonCode: string
  /** ID cửa hàng */
  ShopID: number
  /** Tên shipper */
  ShipperName: string
  /** SĐT shipper */
  ShipperPhone: string
  /** Tên người nhận */
  ToName: string
  /** SĐT người nhận */
  ToPhone: string
  /** Địa chỉ người nhận */
  ToAddress: string
  /** ID quận người nhận */
  ToDistrictID: number
  /** Mã phường người nhận */
  ToWardCode: string
  /** Trọng lượng (gram) */
  Weight: number
  /** Trọng lượng quy đổi */
  ConvertedWeight: number
  /** Số tiền COD */
  CODAmount: number
  /** Ngày chuyển tiền COD */
  CODTransferDate: string
  /** Loại thanh toán */
  PaymentTypeID: number
  /** Chi tiết phí */
  Fee: Record<string, number>
  /** Loại callback: "create" | "switch_status" | "update_weight" | "update_cod" | "update_fee" */
  Type: string
  /** 1 nếu sẵn sàng lấy hàng */
  IsReadyToPick: number
}

// ─── API Response wrapper ──────────────────────────────────────────────────────

export interface GHNApiResponse<T> {
  code: number
  message: string
  data: T | null
  code_message?: string
}

// ─── Error class ──────────────────────────────────────────────────────────────

export class GHNError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'GHNError'
  }
}
