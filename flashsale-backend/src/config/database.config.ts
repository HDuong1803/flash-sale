// Database Configuration for Connection Pooling
export interface DatabaseConfig {
  // Primary database URL (through pgbouncer/pgpool)
  url: string

  // Direct database URL (bypass connection pooler for migrations)
  directUrl?: string

  // Connection pool settings
  connectionLimit: number
  connectionTimeout: number
  idleTimeout: number
  maxLifetime: number

  // Retry and resilience settings
  retryAttempts: number
  retryDelay: number

  // Monitoring and logging
  enableQueryLogging: boolean
  slowQueryThreshold: number

  // SSL settings
  ssl: {
    enabled: boolean
    rejectUnauthorized: boolean
    ca?: string
    cert?: string
    key?: string
  }
}

export interface PgPoolConfig {
  // pgpool-II specific settings
  backend_hostname: string
  backend_port: number
  backend_weight: number
  backend_data_directory: string

  // Connection pooling
  num_init_children: number
  max_pool: number
  child_life_time: number
  child_max_connections: number

  // Load balancing
  load_balance_mode: boolean
  master_slave_mode: boolean
  master_slave_sub_mode: string

  // Health check
  health_check_period: number
  health_check_timeout: number
  health_check_user: string
}

export interface PgBouncerConfig {
  // pgbouncer specific settings
  listen_addr: string
  listen_port: number
  auth_type: string
  auth_file: string

  // Pool settings
  pool_mode: 'session' | 'transaction' | 'statement'
  max_client_conn: number
  default_pool_size: number
  min_pool_size: number
  reserve_pool_size: number

  // Timeouts
  server_connect_timeout: number
  server_login_retry: number
  client_login_timeout: number

  // Logging
  log_connections: boolean
  log_disconnections: boolean
  log_pooler_errors: boolean
}

export const defaultDatabaseConfig: DatabaseConfig = {
  url: process.env.DATABASE_URL || '',
  directUrl: process.env.DIRECT_DATABASE_URL,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '20'),
  connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
  idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
  maxLifetime: parseInt(process.env.DB_MAX_LIFETIME || '3600000'), // 1 hour
  retryAttempts: parseInt(process.env.DB_RETRY_ATTEMPTS || '3'),
  retryDelay: parseInt(process.env.DB_RETRY_DELAY || '1000'),
  enableQueryLogging: process.env.NODE_ENV === 'development',
  slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD || '1000'),
  ssl: {
    enabled: process.env.DB_SSL_ENABLED === 'true',
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    ca: process.env.DB_SSL_CA,
    cert: process.env.DB_SSL_CERT,
    key: process.env.DB_SSL_KEY
  }
}

export const defaultPgPoolConfig: PgPoolConfig = {
  backend_hostname: process.env.PGPOOL_BACKEND_HOSTNAME || '',
  backend_port: parseInt(process.env.PGPOOL_BACKEND_PORT || '5432'),
  backend_weight: parseInt(process.env.PGPOOL_BACKEND_WEIGHT || '1'),
  backend_data_directory:
    process.env.PGPOOL_BACKEND_DATA_DIR || '/var/lib/postgresql/data',

  num_init_children: parseInt(process.env.PGPOOL_NUM_INIT_CHILDREN || '10'),
  max_pool: parseInt(process.env.PGPOOL_MAX_POOL || '4'),
  child_life_time: parseInt(process.env.PGPOOL_CHILD_LIFE_TIME || '300'),
  child_max_connections: parseInt(
    process.env.PGPOOL_CHILD_MAX_CONNECTIONS || '0'
  ),

  load_balance_mode: process.env.PGPOOL_LOAD_BALANCE_MODE === 'true',
  master_slave_mode: process.env.PGPOOL_MASTER_SLAVE_MODE === 'true',
  master_slave_sub_mode: process.env.PGPOOL_MASTER_SLAVE_SUB_MODE || 'sync',

  health_check_period: parseInt(process.env.PGPOOL_HEALTH_CHECK_PERIOD || '10'),
  health_check_timeout: parseInt(
    process.env.PGPOOL_HEALTH_CHECK_TIMEOUT || '5'
  ),
  health_check_user: process.env.PGPOOL_HEALTH_CHECK_USER || 'postgres'
}

export const defaultPgBouncerConfig: PgBouncerConfig = {
  listen_addr: process.env.PGBOUNCER_LISTEN_ADDR || '0.0.0.0',
  listen_port: parseInt(process.env.PGBOUNCER_LISTEN_PORT || '6432'),
  auth_type: process.env.PGBOUNCER_AUTH_TYPE || 'md5',
  auth_file: process.env.PGBOUNCER_AUTH_FILE || '/etc/pgbouncer/userlist.txt',

  pool_mode: (process.env.PGBOUNCER_POOL_MODE as any) || 'transaction',
  max_client_conn: parseInt(process.env.PGBOUNCER_MAX_CLIENT_CONN || '100'),
  default_pool_size: parseInt(process.env.PGBOUNCER_DEFAULT_POOL_SIZE || '20'),
  min_pool_size: parseInt(process.env.PGBOUNCER_MIN_POOL_SIZE || '5'),
  reserve_pool_size: parseInt(process.env.PGBOUNCER_RESERVE_POOL_SIZE || '5'),

  server_connect_timeout: parseInt(
    process.env.PGBOUNCER_SERVER_CONNECT_TIMEOUT || '15'
  ),
  server_login_retry: parseInt(
    process.env.PGBOUNCER_SERVER_LOGIN_RETRY || '15'
  ),
  client_login_timeout: parseInt(
    process.env.PGBOUNCER_CLIENT_LOGIN_TIMEOUT || '60'
  ),

  log_connections: process.env.PGBOUNCER_LOG_CONNECTIONS === 'true',
  log_disconnections: process.env.PGBOUNCER_LOG_DISCONNECTIONS === 'true',
  log_pooler_errors: process.env.PGBOUNCER_LOG_POOLER_ERRORS === 'true'
}
