/**
 * Artillery Processor — quản lý auth và customer rotation cho Flash Sale load test
 *
 * Chức năng:
 *   - beforeAll:  login tất cả hist-customers, cache JWT tokens
 *   - beforeAll:  lấy danh sách campaignProductIds từ ACTIVE campaign
 *   - generatePurchaseRequest: mỗi VU lấy token + cpId + unique idempotencyKey
 *
 * Yêu cầu môi trường:
 *   API_URL=http://localhost:3000          (mặc định)
 *   ARTILLERY_CUSTOMERS=150               (số customers để login, mặc định 150)
 *   CAMPAIGN_PRODUCT_ID=clxxxxxx          (tùy chọn — ghi đè auto-detect)
 * @type {import('artillery').Processor}
 */

'use strict'

const https = require('https')
const http = require('http')
const { randomUUID } = require('crypto')

// ─── State ────────────────────────────────────────────────────────────────────

const customers = [] // [{ email, token }]
const campaignProductIds = [] // [cpId, ...]
let customerIdx = 0

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

function request(url, method, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const lib = u.protocol === 'https:' ? https : http
    const data = body ? JSON.stringify(body) : null

    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...headers
        },
        // Bỏ qua TLS errors cho localhost dev
        rejectUnauthorized: false
      },
      res => {
        let raw = ''
        res.on('data', chunk => {
          raw += chunk
        })
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) })
          } catch {
            resolve({ status: res.statusCode, body: raw })
          }
        })
      }
    )

    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * beforeAll — chạy một lần trước khi test bắt đầu
 * Login tất cả hist-customers và auto-detect ACTIVE campaign
 */
module.exports.beforeAll = async function (context, events, done) {
  const BASE = process.env.API_URL || 'http://localhost:3000'
  const NUM_CUSTOMERS = parseInt(process.env.ARTILLERY_CUSTOMERS || '150', 10)
  const BATCH = 10
  const PASSWORD = 'Test@123456'

  console.log(
    `\n[Artillery] Đang login ${NUM_CUSTOMERS} customers (batch=${BATCH})...`
  )

  // Login theo batches để tránh overwhelm auth endpoint
  for (let i = 0; i < NUM_CUSTOMERS; i += BATCH) {
    const batchPromises = []
    for (let j = i; j < Math.min(i + BATCH, NUM_CUSTOMERS); j++) {
      const pad = String(j + 1).padStart(3, '0')
      const email = `hist-customer-${pad}@test.vn`
      batchPromises.push(
        request(`${BASE}/api/v1/auth/login`, 'POST', {
          email,
          password: PASSWORD
        })
          .then(res => {
            const token = res.body?.data?.accessToken
            if (token) {
              customers.push({ email, token })
            }
          })
          .catch(err => {
            console.warn(`[Artillery] Login ${email} thất bại: ${err.message}`)
          })
      )
    }
    await Promise.all(batchPromises)
    process.stdout.write(
      `  Đã login: ${Math.min(i + BATCH, NUM_CUSTOMERS)}/${NUM_CUSTOMERS}\r`
    )
  }

  console.log(
    `\n[Artillery] ✅ Đã login ${customers.length}/${NUM_CUSTOMERS} customers`
  )

  if (customers.length === 0) {
    console.error(
      '[Artillery] ❌ Không login được customer nào. Kiểm tra pnpm seed:historical và API server.'
    )
    return done(new Error('No customers available'))
  }

  // Auto-detect ACTIVE campaign
  const cpIdFromEnv = process.env.CAMPAIGN_PRODUCT_ID
  if (cpIdFromEnv) {
    campaignProductIds.push(cpIdFromEnv)
    console.log(
      `[Artillery] ✅ Dùng CAMPAIGN_PRODUCT_ID từ env: ${cpIdFromEnv}`
    )
  } else {
    // Lấy danh sách campaigns từ API
    const token = customers[0].token
    const res = await request(
      `${BASE}/api/v1/campaigns?status=ACTIVE&limit=1`,
      'GET',
      null,
      { Authorization: `Bearer ${token}` }
    )

    const campaigns = res.body?.data?.items ?? res.body?.data ?? []
    const firstCampaign = Array.isArray(campaigns) ? campaigns[0] : null

    if (firstCampaign?.id) {
      // Lấy chi tiết campaign để có campaignProducts
      const detail = await request(
        `${BASE}/api/v1/campaigns/${firstCampaign.id}`,
        'GET',
        null,
        { Authorization: `Bearer ${token}` }
      )
      const cps = detail.body?.data?.campaignProducts ?? []
      for (const cp of cps) {
        if (cp.id) campaignProductIds.push(cp.id)
      }
      console.log(
        `[Artillery] ✅ Campaign: "${firstCampaign.name}" — ${campaignProductIds.length} products`
      )
    }
  }

  if (campaignProductIds.length === 0) {
    console.error(
      '[Artillery] ❌ Không tìm được campaignProductId. Set env CAMPAIGN_PRODUCT_ID hoặc đảm bảo có ACTIVE campaign.'
    )
    return done(new Error('No campaignProductIds available'))
  }

  done()
}

/**
 * generatePurchaseRequest — chạy trước mỗi scenario
 * Gán token, idempotencyKey, và campaignProductId vào context của VU
 */
module.exports.generatePurchaseRequest = function (context, events, done) {
  const customer = customers[customerIdx % customers.length]
  const cpId = campaignProductIds[customerIdx % campaignProductIds.length]
  customerIdx++

  context.vars.token = customer.token
  // UUID đảm bảo mỗi request là duy nhất, không bị Redis idempotency block
  context.vars.idempotencyKey = `art-${Date.now()}-${randomUUID().slice(0, 8)}`
  context.vars.campaignProductId = cpId

  done()
}
