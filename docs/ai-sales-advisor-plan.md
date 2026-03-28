# Kế hoạch: AI Sales Advisor cho Merchant

> Trạng thái: **Draft — chờ xét duyệt trước khi triển khai**
> Ngày: 2026-03-23

---

## 1. Vấn đề cần giải quyết

Merchant hiện tại tự quyết định toàn bộ chiến lược flash sale:
- Chọn giá sale dựa trên cảm tính → bán hết quá nhanh (bỏ tiền trên bàn) hoặc tồn nhiều (giảm uy tín)
- Không biết khoảng thời gian nào trong ngày có demand cao nhất
- Không biết mình đang ở đâu so với thị trường (đắt hơn? rẻ hơn? discount ít hơn?)
- Khi tạo campaign mới phải đoán inventory nên đặt bao nhiêu, discount nên sâu tới đâu

**Mục tiêu:** Cung cấp cho merchant một AI advisor tự động đọc dữ liệu lịch sử của họ + dữ liệu thị trường ẩn danh, đưa ra gợi ý cụ thể, có căn cứ trước mỗi chiến dịch flash sale.

---

## 2. Phạm vi phân tích — Dữ liệu có sẵn

### 2.1 Dữ liệu riêng của merchant (private)

| Nguồn | Insight có thể rút ra |
|---|---|
| `Campaign` + `CampaignProduct` | Lịch sử chiến dịch, discount depth qua các lần |
| `Order` + `OrderItem` | Revenue, conversion, AOV theo từng campaign |
| `Reservation` (HOLDING / PAID / EXPIRED) | Tỷ lệ bỏ giỏ — demand thực vs đơn thành công |
| `StockAuditLog` | Tốc độ bán hết (stockout velocity) — bán hết sau bao phút? |
| `Payment.failureReason` | Phương thức thanh toán nào fail nhiều nhất |
| `PreRegistration` | Số người đăng ký trước vs số người thực sự mua |

### 2.2 Dữ liệu thị trường — ANONYMIZED AGGREGATES (không phải dữ liệu cá nhân đối thủ)

> ⚠️ **Nguyên tắc bắt buộc:** Không bao giờ expose dữ liệu của một merchant cụ thể cho merchant khác.
> Chỉ aggregate ở mức toàn hệ thống và ẩn danh hoàn toàn.

| Metric tổng hợp | Cách tính |
|---|---|
| Discount depth trung bình theo category | AVG `(originalPrice - salePrice) / originalPrice` GROUP BY `Product.category` |
| Sell-through rate trung bình theo category | AVG `ordersCount / saleQuantity` |
| Khung giờ demand cao nhất | Histogram `Reservation.createdAt` giờ trong ngày, aggregated toàn hệ thống |
| Thời gian bán hết trung bình theo inventory size | AVG `stockout_time - startTime` GROUP BY `saleQuantity` bucket |
| Pre-registration → purchase conversion | AVG `paidReservations / preRegistrations` |

Đây là "market benchmarks" — không phải "xem data đối thủ". Tương tự như cách Amazon Seller Central hay Shopify Analytics cung cấp market context mà không lộ data từng shop.

---

## 3. Kiến trúc đề xuất

### Luồng tổng quan

```
Merchant mở trang "Tạo campaign" hoặc "Advisor"
  → Frontend gọi POST /merchants/ai-advisor
  → Backend: chạy các analytics queries (dữ liệu riêng + market aggregates)
  → Kết quả queries → format thành structured context
  → Gọi Claude API với context + prompt
  → Claude trả về gợi ý có cấu trúc (JSON)
  → Backend lưu cache vào Redis (TTL: 1 giờ)
  → Frontend hiển thị card gợi ý cho merchant
```

### Lý do chọn Pre-computed Analytics + Claude API (không phải Tool Use)

Có 3 approach:

| Approach | Pros | Cons |
|---|---|---|
| **A. Pre-computed + Claude** | Nhanh, chi phí thấp, kiểm soát được data gửi lên | Phải tự viết queries |
| **B. Claude Tool Use** (Claude gọi DB trực tiếp) | Flexible, Claude tự biết cần data gì | Latency cao, khó kiểm soát queries, tốn token nhiều hơn, rủi ro bảo mật |
| **C. Fine-tuned model** | Phản hồi nhanh | Chi phí training, cần labeled data, khó maintain |

**Chọn Approach A** vì:
- Kiểm soát hoàn toàn query, không rò data ngoài ý muốn
- Latency dự đoán được (queries ~200ms + Claude API ~2-3s)
- Chi phí token thấp hơn vì context được nén trước
- Dễ audit và debug

### Chi tiết luồng backend

```
POST /merchants/ai-advisor
  │
  ├─ 1. Check Redis cache (key: advisor:{merchantId}) → hit? trả về ngay
  │
  ├─ 2. Parallel analytics queries:
  │     ├─ Query A: Merchant's campaign history (last 6 months)
  │     │   → per-campaign: discount%, sell-through%, stockout_velocity, conversion_rate, revenue
  │     ├─ Query B: Reservation expiry rate per campaign
  │     ├─ Query C: Pre-reg demand signals
  │     ├─ Query D: Market benchmarks (anonymized aggregates)
  │     │   → avg discount by category, avg sell-through, peak hours
  │     └─ Query E: Merchant's pending/draft campaigns
  │
  ├─ 3. Aggregate & shape data into AdvisorContext struct
  │
  ├─ 4. Call Claude API (claude-sonnet-4-6)
  │     Context: AdvisorContext (JSON ~2-3KB)
  │     Prompt: "Phân tích và đưa ra gợi ý..."
  │     Response format: JSON schema cố định
  │
  ├─ 5. Parse + validate Claude response
  │
  ├─ 6. Cache result (Redis TTL: 1h)
  │
  └─ 7. Return AdvisorResponseDto
```

---

## 4. Những gợi ý AI sẽ đưa ra

### 4.1 Phân tích hiệu suất chiến dịch gần đây
- Campaign nào hoạt động tốt nhất / kém nhất và vì sao (dựa trên data)
- Xu hướng conversion rate của merchant qua thời gian
- "Campaign X có conversion 73% — cao nhất trong 6 tháng vì discount 40% là điểm ngọt cho category điện thoại"

### 4.2 Gợi ý giá và discount
- Khoảng discount tối ưu dựa trên lịch sử của chính merchant
- So sánh với market benchmark cùng category
- "Discount 30-35% cho sản phẩm phụ kiện điện thoại có sell-through >90% trong thị trường; campaign gần nhất của bạn dùng 20% và chỉ bán được 58%"

### 4.3 Gợi ý thời điểm tổ chức
- Giờ/ngày có demand cao nhất dựa trên reservation history
- So sánh với market peak hours
- "Thị trường có demand cao nhất 19:00-22:00 thứ 6 và thứ 7; 3 campaign gần nhất của bạn chạy buổi sáng — conversion thấp hơn 40%"

### 4.4 Gợi ý inventory
- Số lượng tối ưu để bán hết trong ~30 phút (tạo FOMO) nhưng không quá ít
- Dựa trên stockout velocity của merchant + market benchmarks
- "Campaign tốt nhất của bạn (campaign X) bán hết trong 18 phút với 50 units. Với sản phẩm tương tự, đặt 60-80 units để tăng revenue nhưng vẫn tạo urgency"

### 4.5 Cảnh báo rủi ro
- "Tỷ lệ reservation bị expire đang cao (45%) — xem xét giảm holding time hoặc gửi reminder sớm hơn"
- "Pre-registration thấp (12 người) so với inventory 200 units — cân nhắc giảm inventory hoặc tăng marketing trước khi mở sale"

### 4.6 Tóm tắt plan cho campaign tiếp theo (nếu merchant đã có draft)
- AI đọc draft campaign → đánh giá và gợi ý điều chỉnh cụ thể

---

## 5. Cấu trúc dữ liệu

### AdvisorContext (gửi lên Claude)
```typescript
interface AdvisorContext {
  merchant: {
    businessName: string
    totalCampaigns: number
    memberSinceMonths: number
  }
  recentCampaigns: Array<{
    name: string
    category: string
    durationHours: number
    discountPercent: number
    saleQuantity: number
    soldPercent: number          // sell-through rate
    conversionRate: number       // reservations → paid
    expiryRate: number           // reservations that expired
    stockoutMinutes: number | null  // null = never sold out
    revenue: number
    startHour: number            // 0-23
    dayOfWeek: number            // 0-6
  }>
  preRegSignals: Array<{
    campaignName: string
    preRegCount: number
    actualPurchaseCount: number
  }>
  marketBenchmarks: {
    category: string
    avgDiscountPercent: number
    avgSellThroughPercent: number
    peakHours: number[]           // e.g. [19, 20, 21]
    peakDays: number[]            // e.g. [5, 6] = Fri, Sat
    avgStockoutMinutes: number
  }[]
  pendingCampaign?: {
    name: string
    products: Array<{
      name: string
      category: string
      originalPrice: number
      proposedSalePrice: number
      proposedQuantity: number
    }>
    proposedStartTime: string
    proposedEndTime: string
  }
}
```

### AdvisorResponse (Claude trả về)
```typescript
interface AdvisorResponse {
  summary: string                  // 2-3 câu tóm tắt
  performanceInsights: Array<{
    type: 'STRENGTH' | 'WEAKNESS' | 'OPPORTUNITY'
    title: string
    detail: string
    metric?: string                // ví dụ "Conversion: 73%"
  }>
  recommendations: Array<{
    category: 'PRICING' | 'TIMING' | 'INVENTORY' | 'STRATEGY'
    priority: 'HIGH' | 'MEDIUM' | 'LOW'
    title: string
    detail: string
    suggestedValue?: string        // ví dụ "30-35% discount"
    reasoning: string              // dựa trên data gì
  }>
  campaignReview?: {               // chỉ có nếu có pendingCampaign
    overallScore: number           // 1-10
    risks: string[]
    adjustments: Array<{
      field: string
      currentValue: string
      suggestedValue: string
      reason: string
    }>
  }
  generatedAt: string              // ISO timestamp
}
```

---

## 6. Thiết kế API Backend

```
POST /merchants/ai-advisor
  Body: { campaignId?: string }   // optional: attach a specific draft campaign
  Auth: JWT (MERCHANT only)
  Returns: AdvisorResponseDto
  Cache: Redis TTL 1h (key: advisor:{merchantId}:{campaignId?})

DELETE /merchants/ai-advisor/cache
  Auth: JWT (MERCHANT only)
  Returns: 200 OK
  // Cho phép merchant force-refresh gợi ý
```

**Rate limiting:** 10 requests/hour/merchant để kiểm soát chi phí Claude API.

---

## 7. Thiết kế Frontend

### Vị trí hiển thị
1. **Dashboard page** (`/merchant/dashboard`) — Widget "AI Advisor" collapse/expand
2. **Create campaign page** — Sidebar panel "Gợi ý từ AI" khi merchant đang điền form
3. **Campaign report page** — Section "Phân tích AI" sau mỗi campaign kết thúc

### UI Components
```
┌─────────────────────────────────────────────────────┐
│ 🤖 AI Sales Advisor                    [Làm mới]    │
│ Cập nhật: 15 phút trước                             │
├─────────────────────────────────────────────────────┤
│ 📊 Tổng quan                                        │
│ Conversion rate của bạn (68%) cao hơn thị trường    │
│ (52%) nhưng tỷ lệ hết hàng sớm đang tăng.          │
├─────────────────────────────────────────────────────┤
│ 🎯 Ưu tiên cao                                      │
│ ┌─ Tối ưu thời điểm ─────────────────────────────┐ │
│ │ Chạy sale vào 19:00-21:00 thứ 6, thứ 7.        │ │
│ │ Demand thị trường cao hơn 2.3x so với hiện tại  │ │
│ │ bạn đang chọn (sáng thứ 3-4).                  │ │
│ └────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─ Điều chỉnh discount ──────────────────────────┐ │
│ │ Tăng discount từ 20% → 30-35% cho phụ kiện.    │ │
│ │ Thị trường: avg sell-through 91% ở 30%+.       │ │
│ │ Bạn hiện tại: 58% ở 20%.                       │ │
│ └────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│ [Xem toàn bộ phân tích ↓]                          │
└─────────────────────────────────────────────────────┘
```

### Loading state
- Skeleton shimmer với text "Đang phân tích dữ liệu của bạn..."
- Estimated time: ~3-5 giây (queries + Claude API)
- Timeout 15s: hiển thị nút "Thử lại" nếu quá thời gian

---

## 8. Chi phí ước tính

### Claude API (claude-sonnet-4-6)
- Input: ~3KB context ≈ ~800 tokens
- Output: ~1KB response ≈ ~300 tokens
- Giá: $3/1M input tokens + $15/1M output tokens
- **Chi phí mỗi request: ~$0.0024 + $0.0045 ≈ $0.007/request**

### Với 1,000 merchant active, mỗi người dùng 3 lần/ngày:
- ~3,000 requests/ngày
- **~$21/ngày ≈ $630/tháng**

### Tối ưu chi phí
- Cache Redis 1h: giảm ~60-70% requests thực tế → ~$200-250/tháng
- Rate limit 10 req/h/merchant: phòng spam
- Chỉ gọi Claude khi có ít nhất 1 campaign đã hoàn thành (merchant mới chưa đủ data)

---

## 9. Các vấn đề cần làm rõ trước khi triển khai

### ❓ Vấn đề 1: Market benchmark có đủ data không?
**Hiện tại:** Nếu số merchant active còn ít (< 50), market benchmark sẽ không đại diện.
**Giải pháp:** Chỉ bật feature khi platform có ≥ 50 campaign đã hoàn thành. Fallback: không hiển thị market section, chỉ phân tích dữ liệu riêng.

### ❓ Vấn đề 2: Product.category là free text — không normalize
**Hiện tại:** Category "Điện thoại", "điện thoại", "Phone" được coi là 3 category khác nhau.
**Giải pháp:** Thêm category normalization (lowercase + trim) trong query, hoặc thêm category enum trước khi implement feature này. **Đây có thể là prerequisite.**

### ❓ Vấn đề 3: Latency — Merchant chờ 3-5s mỗi lần
**Giải pháp:** Pre-warm cache bằng background job: mỗi khi campaign của merchant kết thúc, tự động trigger AI analysis và lưu vào Redis. Merchant vào dashboard thấy kết quả ngay.

### ❓ Vấn đề 4: Độ tin cậy của gợi ý AI
**Rủi ro:** Claude có thể tự tin đưa ra gợi ý sai lệch nếu dữ liệu ít.
**Giải pháp:**
- Yêu cầu Claude luôn cite nguồn dữ liệu cụ thể trong `reasoning` field
- Hiển thị rõ "Dựa trên X campaigns gần nhất" để merchant tự đánh giá
- Thêm disclaimer: "Đây là gợi ý tham khảo, không phải đảm bảo kết quả"
- Minimum data threshold: chỉ tạo AI analysis nếu merchant có ≥ 3 campaigns đã ENDED

### ❓ Vấn đề 5: Privacy — Merchant có đồng ý data được dùng cho market benchmark không?
**Giải pháp:** Thêm vào Terms of Service, hoặc opt-in toggle trong merchant settings. Nếu opt-out: chỉ phân tích dữ liệu riêng của họ, không đóng góp vào market aggregates.

---

## 10. Phân kỳ triển khai

### Phase 1 — Foundation (trước khi implement AI)
- [ ] Normalize `Product.category` → enum hoặc controlled list
- [ ] Thêm `getAdvisorContext(merchantId)` query vào `MerchantRepository`
- [ ] Thêm market benchmark aggregation query (anonymized)
- [ ] Test các queries — đảm bảo không leak merchant-specific data

### Phase 2 — AI Integration (backend only)
- [ ] Tích hợp Claude API (`@anthropic-ai/sdk`)
- [ ] Viết system prompt + context formatter
- [ ] `POST /merchants/ai-advisor` endpoint với rate limiting
- [ ] Redis caching layer
- [ ] Background job trigger sau campaign kết thúc

### Phase 3 — Frontend
- [ ] `useAdvisorInsights` hook
- [ ] `AdvisorWidget` component (dashboard)
- [ ] Sidebar panel trong create campaign form
- [ ] Campaign report AI section

### Phase 4 — Tuning & Monitoring
- [ ] Thu thập merchant feedback (thumbs up/down trên mỗi gợi ý)
- [ ] Theo dõi correlation: gợi ý được theo → kết quả tốt hơn không?
- [ ] Điều chỉnh prompt dựa trên feedback
- [ ] Cost monitoring dashboard

---

## 11. Điều kiện tiên quyết (Prerequisites)

Trước khi bắt đầu code:

1. **Quyết định về category normalization** — Feature này phụ thuộc vào category có ý nghĩa để benchmark. Nếu category vẫn là free text → market benchmark theo category sẽ kém chính xác.

2. **Xác định threshold tối thiểu** — Merchant cần bao nhiêu campaigns để nhận gợi ý có ý nghĩa? Đề xuất: ≥ 3 campaigns đã ENDED.

3. **Privacy policy update** — Cần cập nhật ToS để nói rõ dữ liệu ẩn danh được dùng cho market benchmarks.

4. **Claude API key và billing** — Setup tài khoản Anthropic, ước tính budget.

5. **Quyết định UI placement** — Widget dashboard hay tích hợp sâu vào campaign creation flow? Ảnh hưởng đến scope Phase 3.

---

## Kết luận

Feature này khả thi và có giá trị thực sự cho merchant. Complexity nằm ở việc thiết kế queries aggregation tốt và prompt engineering cho Claude, không phải ở infrastructure. Với cache strategy, chi phí kiểm soát được ở mức $200-250/tháng cho 1,000 active merchants.

**Khuyến nghị:** Giải quyết Prerequisites 1-3 trước, sau đó bắt đầu Phase 1 và 2 song song.
