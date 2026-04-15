export const config = {
  application: {
    PORT: 3000,
    BCRYPT_SALT: 10,
    HOST: '',
    ENV: 'development',
    isProd: false,
    CLIENT_URL: '',
    SERVER_URL: '',
    CLIENT_API_HOST: '',
    COOKIE_CROSS_SITE: 'false'
  },

  database: {
    DB_CONNECTOR: 'postgres',
    DB_HOST: '',
    DB_USER: '',
    DB_PASSWORD: '',
    DB_DATABASE: '',
    DB_PORT: 5432,
    DATABASE_URL: ''
  },

  secrets: {
    JWT_PRIVATE_KEY: '',
    JWT_REFRESH_PRIVATE_KEY: '',
    JWT_PUBLIC_KEY: '',
    JWT_ALGORITHM: 'HS256',
    JWT_EXPIRE_TIME: 86400,
    JWT_EXPIRE_REFRESH_TIME: 604800,
    SESSION_SECRET: '',
    JWT_SECRET_KEY: '',
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: ''
  },

  logger: {
    GRAFANA_LOKI_URL: ''
  },

  redis: {
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    REDIS_USERNAME: '',
    REDIS_PASSWORD: '',
    REDIS_URL: '',
    REDIS_CACHE_EXPIRATION: '300'
  },

  rabbitmq: {
    RABBITMQ_URL: 'amqp://localhost:5672'
  },

  ipfs: {
    IPFS_WEB_GATEWAY: 'https://cloudflare-ipfs.com/ipfs/'
  },

  cloudinary: {
    CLOUDINARY_CLOUD_NAME: '',
    CLOUDINARY_API_KEY: '',
    CLOUDINARY_API_SECRET: ''
  },

  stripe: {
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    STRIPE_CONNECT_COUNTRY: 'VN'
  },

  timeouts: {
    WEBHOOK_TIMEOUT_MS: 30_000,
    SLOW_REQUEST_THRESHOLD_MS: 1000,
    CHECKOUT_ADDRESS_TTL_SECONDS: 1200,
    LONG_RUNNING_REQUEST_TIMEOUT_MS: 60_000,
    NORMAL_REQUEST_TIMEOUT_MS: 30_000
  },

  postmark: {
    POSTMARK_SERVER_TOKEN: '',
    EMAIL_PROVIDER: 'resend',
    SENDER_EMAIL: '',
    EMAIL_SUPPORT: '',
    RESEND_API_KEY: ''
  },

  telegram: {
    BOT_TOKEN: '',
    BOT_USERNAME: '',
    WEBHOOK_SECRET: '',
    ALLOW_LEGACY_PATH_SECRET_AUTH: 'false'
  }
}
