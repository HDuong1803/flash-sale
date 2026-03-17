export const config = {
  application: {
    PORT: 3000,
    BCRYPT_SALT: 10,
    HOST: '',
    ENV: 'development',
    isProd: false,
    CLIENT_URL: '',
    SERVER_URL: ''
  },

  database: {
    DB_CONNECTOR: 'postgres',
    DB_HOST: '',
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_DATABASE: '',
    DB_PORT: 5432,
    DATABASE_URL: ''
  },

  secrets: {
    JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY || '',
    JWT_REFRESH_PRIVATE_KEY: process.env.JWT_REFRESH_PRIVATE_KEY || '',
    JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY || '',
    JWT_ALGORITHM: 'HS256',
    JWT_EXPIRE_TIME: 86400,
    JWT_EXPIRE_REFRESH_TIME: 86400 * 7,
    SESSION_SECRET: process.env.SESSION_SECRET || ''
  },

  logger: {
    GRAFANA_LOKI_URL: ''
  },

  frontend: {
    FRONTEND_URL: process.env.FRONTEND_URL || ''
  },

  redis: {
    REDIS_HOST: '',
    REDIS_PORT: '6379',
    REDIS_USERNAME: '',
    REDIS_PASSWORD: '',
    REDIS_URL: '',
    REDIS_CACHE_EXPIRATION: '300'
  },

  postmark: {
    POSTMARK_SERVER_TOKEN: '',
    EMAIL_PROVIDER: 'resend',
    SENDER_EMAIL: '',
    EMAIL_SUPPORT: '',
    RESEND_API_KEY: ''
  }
}
