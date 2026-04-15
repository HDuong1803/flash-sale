export const config = {
  application: {
    PORT: Number(process.env.PORT),
    BCRYPT_SALT: Number(process.env.BCRYPT_SALT),
    HOST: process.env.HOST,
    ENV: 'production',
    isProd: true,
    NODE_ENV: process.env.NODE_ENV,
    CLIENT_URL_SERVER: process.env.CLIENT_URL_SERVER,
    BACKEND_URL_SERVER: process.env.BACKEND_URL_SERVER,
    CLIENT_URL_LOCAL: process.env.CLIENT_URL_LOCAL,
    BACKEND_URL_LOCAL: process.env.BACKEND_URL_LOCAL
  },

  database: {
    DB_CONNECTOR: process.env.DB_CONNECTOR,
    DB_HOST: process.env.DB_HOST,
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_DATABASE: process.env.DB_DATABASE,
    DB_NAME: process.env.DB_NAME,
    DB_PORT: Number(process.env.DB_PORT),
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL
  },

  secrets: {
    JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY,
    JWT_REFRESH_PRIVATE_KEY: process.env.JWT_REFRESH_PRIVATE_KEY,
    JWT_CLIENT_PRIVATE_KEY: process.env.JWT_CLIENT_PRIVATE_KEY,
    JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY,
    JWT_ALGORITHM: process.env.JWT_ALGORITHM,
    JWT_EXPIRE_TIME: Number(process.env.JWT_EXPIRE_TIME) || 900,
    JWT_EXPIRE_REFRESH_TIME:
      Number(process.env.JWT_EXPIRE_REFRESH_TIME) || 604800,
    SESSION_SECRET: process.env.SESSION_SECRET,
    JWT_SECRET_KEY: process.env.JWT_SECRET_KEY,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET
  },

  redis: {
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_USERNAME: process.env.REDIS_USERNAME,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    REDIS_URL: process.env.REDIS_URL,
    REDIS_CACHE_EXPIRATION: process.env.REDIS_CACHE_EXPIRATION
  },

  ipfs: {
    UPLOAD_SERVER_BASE_URL: process.env.UPLOAD_SERVER_BASE_URL,
    GET_UPLOAD_FILE_BASE_URL: process.env.GET_UPLOAD_FILE_BASE_URL,
    LOCAL_SERVER_BASE_URL: process.env.LOCAL_SERVER_BASE_URL,
    IPFS_WEB_GATEWAY: process.env.IPFS_WEB_GATEWAY
  },

  contract: {
    NFT_CONTRACT_ADDRESS: process.env.NFT_CONTRACT_ADDRESS
  },

  logger: {
    GRAFANA_LOKI_URL: process.env.GRAFANA_LOKI_URL || 'http://localhost:3100'
  },

  coingecko: {
    COINGECKO_API_KEY: process.env.COINGECKO_API_KEY
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
    VENDOR_EMAIL: process.env.VENDOR_EMAIL,
    VENDOR_CC_EMAIL: process.env.VENDOR_CC_EMAIL
  },

  postmark: {
    POSTMARK_SERVER_TOKEN: process.env.POSTMARK_SERVER_TOKEN,
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    SENDER_EMAIL: process.env.SENDER_EMAIL,
    EMAIL_SUPPORT: process.env.EMAIL_SUPPORT,
    RESEND_API_KEY: process.env.RESEND_API_KEY
  },

  telegram: {
    BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
    WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    ALLOW_LEGACY_PATH_SECRET_AUTH:
      process.env.TELEGRAM_ALLOW_LEGACY_PATH_SECRET_AUTH ?? 'false'
  },

  sendgrid: {
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY
  },

  veriff: {
    VERIFF_API_KEY: process.env.VERIFF_API_KEY,
    VERIFF_API_SECRET: process.env.VERIFF_API_SECRET,
    VERIFF_BASE_URL: process.env.VERIFF_BASE_URL
  },

  paypal: {
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
    PAYPAL_RETURN_URL: process.env.PAYPAL_RETURN_URL,
    PAYPAL_CANCEL_URL: process.env.PAYPAL_CANCEL_URL,
    PAYPAL_BASE_URL: process.env.PAYPAL_BASE_URL,
    PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID,
    CLIENT_API_HOST: process.env.CLIENT_API_HOST
  },

  rabbitmq: {
    RABBITMQ_URL: process.env.RABBITMQ_URL
  },

  cloudinary: {
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET
  },

  stripe: {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_CONNECT_COUNTRY: process.env.STRIPE_CONNECT_COUNTRY
  },

  timeouts: {
    WEBHOOK_TIMEOUT_MS: Number(process.env.WEBHOOK_TIMEOUT_MS),
    SLOW_REQUEST_THRESHOLD_MS: Number(process.env.SLOW_REQUEST_THRESHOLD_MS),
    CHECKOUT_ADDRESS_TTL_SECONDS: Number(
      process.env.CHECKOUT_ADDRESS_TTL_SECONDS
    ),
    LONG_RUNNING_REQUEST_TIMEOUT_MS: Number(
      process.env.LONG_RUNNING_REQUEST_TIMEOUT_MS
    ),
    NORMAL_REQUEST_TIMEOUT_MS: Number(process.env.NORMAL_REQUEST_TIMEOUT_MS)
  },

  admin: {
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_NAME: process.env.ADMIN_NAME
  },

  easypost: {
    EASYPOST_API_KEY: process.env.EASYPOST_API_KEY,
    EASYPOST_WEBHOOK_SECRET: process.env.EASYPOST_WEBHOOK_SECRET,
    EASYPOST_SANDBOX: process.env.EASYPOST_SANDBOX
  },

  apiagent: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL
  }
}
