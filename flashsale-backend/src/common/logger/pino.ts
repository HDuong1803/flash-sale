import pino from 'pino'

const isProduction = process.env.NODE_ENV === 'production'
const wantsPrettyTransport = process.env.LOG_PRETTY !== 'false'

function canUsePrettyTransport(): boolean {
  if (isProduction || !wantsPrettyTransport) return false

  try {
    require.resolve('pino-pretty')
    return true
  } catch {
    return false
  }
}

const loggerOptions = canUsePrettyTransport()
  ? {
      level: 'debug',
      transport: {
        target: 'pino-pretty'
      }
    }
  : isProduction
  ? {}
  : {
      level: 'debug'
    }

export const logger = pino(
  loggerOptions,
  pino.multistream(
    [
      { stream: pino.destination({ dest: process.stdout.fd, sync: false }) },
      {
        stream: pino.destination({ dest: process.stderr.fd, sync: false }),
        level: 'error'
      }
    ],
    {}
  )
)
