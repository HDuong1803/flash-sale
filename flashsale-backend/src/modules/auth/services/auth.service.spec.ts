/**
 * TC-01 — Xác thực và bảo mật tài khoản
 *
 * TC-01-01: Đăng ký tài khoản hợp lệ → gửi OTP, trả OTP_REQUIRED
 * TC-01-02: Nhập OTP sai 5 lần liên tiếp → hủy OTP, yêu cầu gửi lại
 * TC-01-03: Đăng nhập sai mật khẩu 5 lần → khóa tài khoản 15 phút
 * TC-01-04: Gửi lại OTP trong cooldown → từ chối, thông báo thời gian chờ
 * TC-01-05: Làm mới token khi access token hết hạn → cấp token mới, không đăng xuất
 */

import * as bcrypt from 'bcrypt'
import type { ConfigService } from '@nestjs/config'
import { OAuth2Client } from 'google-auth-library'
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common'
import { AuthService } from './auth.service'

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn()
}))

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn()
  }))
}))

const bcryptMock = bcrypt as jest.Mocked<typeof bcrypt>

// Suppress unused import warning
void OAuth2Client

// ─── Mock factories ────────────────────────────────────────────────────────────

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-id',
  email: 'test@example.com',
  fullName: 'Nguyễn Văn Test',
  passwordHash: 'hashed-password',
  role: 'CUSTOMER',
  status: 'ACTIVE',
  emailVerified: true,
  photo: null,
  ...overrides
})

const makeRedisClient = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  decr: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn()
})

const makeUserRepo = () => ({
  findByEmail: jest.fn(),
  create: jest.fn(),
  markEmailVerified: jest.fn(),
  updateLastLogin: jest.fn(),
  findById: jest.fn(),
  updatePassword: jest.fn()
})

const makeTokenService = () => ({
  generateAccessToken: jest.fn().mockReturnValue('access-token'),
  generateRefreshToken: jest.fn().mockReturnValue('refresh-token'),
  storeRefreshToken: jest.fn().mockResolvedValue(undefined),
  validateStoredRefreshToken: jest.fn().mockResolvedValue(true),
  verifyRefreshToken: jest.fn().mockReturnValue({ sub: 'user-id' }),
  revokeRefreshToken: jest.fn().mockResolvedValue(undefined)
})

const makeEmailService = () => ({
  sendVerifyOtp: jest.fn().mockResolvedValue(undefined),
  sendResetPasswordOtp: jest.fn().mockResolvedValue(undefined)
})

const makeConfigService = (): ConfigService =>
  ({
    get: jest.fn((key: string) => {
      const vals: Record<string, unknown> = {
        'secrets.GOOGLE_CLIENT_ID': 'google-client-id',
        'application.BCRYPT_SALT': 10
      }
      return vals[key]
    })
  }) as unknown as ConfigService

const buildService = (
  overrides: {
    userRepo?: ReturnType<typeof makeUserRepo>
    tokenService?: ReturnType<typeof makeTokenService>
    redisClient?: ReturnType<typeof makeRedisClient>
    emailService?: ReturnType<typeof makeEmailService>
  } = {}
) => {
  const redisClient = overrides.redisClient ?? makeRedisClient()
  const redis = { client: redisClient }

  const service = new AuthService(
    overrides.userRepo as never,
    overrides.tokenService as never,
    makeConfigService(),
    redis as never,
    overrides.emailService as never
  )

  return { service, redisClient }
}

// ─── TC-01-01 ─────────────────────────────────────────────────────────────────

describe('TC-01-01: Đăng ký tài khoản hợp lệ', () => {
  it('tạo user mới, gửi OTP, trả về OTP_REQUIRED với email', async () => {
    const userRepo = makeUserRepo()
    const emailService = makeEmailService()
    const redisClient = makeRedisClient()

    userRepo.findByEmail.mockResolvedValue(null)
    userRepo.create.mockResolvedValue(makeUser({ emailVerified: false }))
    ;(bcryptMock.hash as jest.Mock).mockResolvedValue('hashed-pw')
    redisClient.incr.mockResolvedValue(1)
    redisClient.expire.mockResolvedValue(1)
    redisClient.set.mockResolvedValue('OK')

    const { service } = buildService({ userRepo, emailService, redisClient })

    const result = await service.register({
      email: 'test@example.com',
      fullName: 'Nguyễn Văn Test',
      password: 'Password@123'
    })

    expect(result).toEqual({
      status: 'OTP_REQUIRED',
      email: 'test@example.com'
    })
    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@example.com', role: 'CUSTOMER' })
    )
    expect(emailService.sendVerifyOtp).toHaveBeenCalledTimes(1)
    expect(redisClient.set).toHaveBeenCalledWith(
      expect.stringContaining('otp:verify:'),
      expect.any(String),
      'EX',
      expect.any(Number)
    )
  })

  it('email đã đăng ký và đã xác minh → ném BadRequestException', async () => {
    const userRepo = makeUserRepo()
    userRepo.findByEmail.mockResolvedValue(makeUser({ emailVerified: true }))

    const { service } = buildService({ userRepo })

    await expect(
      service.register({
        email: 'test@example.com',
        fullName: 'Test',
        password: 'Pw@123'
      })
    ).rejects.toThrow(BadRequestException)
  })
})

// ─── TC-01-02 ─────────────────────────────────────────────────────────────────

describe('TC-01-02: Nhập OTP sai 5 lần liên tiếp', () => {
  it('lần thứ 1-4 sai → ném BadRequestException với số lần còn lại', async () => {
    const redisClient = makeRedisClient()
    redisClient.get.mockResolvedValue('123456')
    redisClient.incr.mockResolvedValue(1)
    redisClient.expire.mockResolvedValue(1)

    const { service } = buildService({ redisClient })

    await expect(
      service.verifyOtp({ email: 'test@example.com', otp: '999999' })
    ).rejects.toThrow(BadRequestException)
  })

  it('lần thứ 5 sai → xóa OTP key + attempts key, ném lỗi yêu cầu gửi lại', async () => {
    const redisClient = makeRedisClient()
    redisClient.get.mockResolvedValue('123456')
    redisClient.incr.mockResolvedValue(5) // đạt giới hạn 5
    redisClient.expire.mockResolvedValue(1)
    redisClient.del.mockResolvedValue(2)

    const { service } = buildService({ redisClient })

    await expect(
      service.verifyOtp({ email: 'test@example.com', otp: '999999' })
    ).rejects.toThrow(/quá nhiều lần/i)

    expect(redisClient.del).toHaveBeenCalledWith('otp:verify:test@example.com')
    expect(redisClient.del).toHaveBeenCalledWith(
      'otp:attempts:verify:test@example.com'
    )
  })

  it('OTP đúng → đánh dấu email đã xác minh, trả về access + refresh token', async () => {
    const redisClient = makeRedisClient()
    const userRepo = makeUserRepo()
    const tokenService = makeTokenService()
    const emailService = makeEmailService()

    redisClient.get.mockResolvedValue('654321')
    redisClient.del.mockResolvedValue(1)
    userRepo.markEmailVerified.mockResolvedValue(
      makeUser({ emailVerified: true })
    )
    userRepo.updateLastLogin.mockResolvedValue(undefined)

    const { service } = buildService({
      userRepo,
      tokenService,
      redisClient,
      emailService
    })

    const result = await service.verifyOtp({
      email: 'test@example.com',
      otp: '654321'
    })

    expect(result).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token'
    })
    expect(userRepo.markEmailVerified).toHaveBeenCalledWith('test@example.com')
  })

  it('OTP hết hạn (không còn trong Redis) → ném BadRequestException', async () => {
    const redisClient = makeRedisClient()
    redisClient.get.mockResolvedValue(null)

    const { service } = buildService({ redisClient })

    await expect(
      service.verifyOtp({ email: 'test@example.com', otp: '123456' })
    ).rejects.toThrow(BadRequestException)
  })
})

// ─── TC-01-03 ─────────────────────────────────────────────────────────────────

describe('TC-01-03: Đăng nhập sai mật khẩu 5 lần → khóa tài khoản 15 phút', () => {
  it('lần thứ 5 sai → đặt lockout key 900s, ném UnauthorizedException', async () => {
    const redisClient = makeRedisClient()
    const userRepo = makeUserRepo()
    const emailService = makeEmailService()

    redisClient.get.mockResolvedValue(null) // không bị khóa
    redisClient.incr.mockResolvedValue(5) // lần thứ 5
    redisClient.expire.mockResolvedValue(1)
    redisClient.set.mockResolvedValue('OK')
    redisClient.del.mockResolvedValue(1)

    userRepo.findByEmail.mockResolvedValue(makeUser({ emailVerified: true }))
    ;(bcryptMock.compare as jest.Mock).mockResolvedValue(false)

    const { service } = buildService({ userRepo, redisClient, emailService })

    await expect(
      service.login({ email: 'test@example.com', password: 'wrong' })
    ).rejects.toThrow(UnauthorizedException)

    expect(redisClient.set).toHaveBeenCalledWith(
      'login:lockout:test@example.com',
      '1',
      'EX',
      900
    )
  })

  it('tài khoản đang bị khóa → ném UnauthorizedException ngay, không query DB', async () => {
    const redisClient = makeRedisClient()
    const userRepo = makeUserRepo()

    redisClient.get.mockResolvedValue('1') // đang bị khóa
    redisClient.ttl.mockResolvedValue(500)

    const { service } = buildService({ userRepo, redisClient })

    await expect(
      service.login({ email: 'test@example.com', password: 'any' })
    ).rejects.toThrow(UnauthorizedException)

    expect(userRepo.findByEmail).not.toHaveBeenCalled()
  })

  it('đăng nhập thành công → xóa failure counter, trả về token', async () => {
    const redisClient = makeRedisClient()
    const userRepo = makeUserRepo()
    const tokenService = makeTokenService()

    redisClient.get.mockResolvedValue(null)
    redisClient.del.mockResolvedValue(1)
    userRepo.findByEmail.mockResolvedValue(makeUser({ emailVerified: true }))
    userRepo.updateLastLogin.mockResolvedValue(undefined)
    ;(bcryptMock.compare as jest.Mock).mockResolvedValue(true)

    const { service } = buildService({ userRepo, tokenService, redisClient })

    const result = await service.login({
      email: 'test@example.com',
      password: 'correct'
    })

    expect(result).toMatchObject({ accessToken: 'access-token' })
    expect(redisClient.del).toHaveBeenCalledWith(
      'login:failures:test@example.com'
    )
  })

  it('email chưa xác minh → ném ForbiddenException với code EMAIL_NOT_VERIFIED', async () => {
    const redisClient = makeRedisClient()
    const userRepo = makeUserRepo()
    const emailService = makeEmailService()

    redisClient.get.mockResolvedValue(null)
    userRepo.findByEmail.mockResolvedValue(makeUser({ emailVerified: false }))
    ;(bcryptMock.compare as jest.Mock).mockResolvedValue(true)

    const { service } = buildService({ userRepo, redisClient, emailService })

    await expect(
      service.login({ email: 'test@example.com', password: 'correct' })
    ).rejects.toThrow(ForbiddenException)
  })
})

// ─── TC-01-04 ─────────────────────────────────────────────────────────────────

describe('TC-01-04: Gửi lại OTP trong thời gian cooldown', () => {
  it('cooldown đang active → ném BadRequestException với thời gian chờ', async () => {
    const redisClient = makeRedisClient()
    const emailService = makeEmailService()

    redisClient.get.mockResolvedValue('1') // cooldown key tồn tại
    redisClient.ttl.mockResolvedValue(45)

    const { service } = buildService({ redisClient, emailService })

    await expect(
      service.resendOtp({ email: 'test@example.com' })
    ).rejects.toThrow(BadRequestException)

    expect(emailService.sendVerifyOtp).not.toHaveBeenCalled()
  })

  it('cooldown đã hết → gửi lại OTP thành công, trả về cooldownSeconds', async () => {
    const redisClient = makeRedisClient()
    const userRepo = makeUserRepo()
    const emailService = makeEmailService()

    redisClient.get.mockResolvedValue(null) // cooldown hết
    redisClient.incr.mockResolvedValue(1)
    redisClient.expire.mockResolvedValue(1)
    redisClient.set.mockResolvedValue('OK')
    userRepo.findByEmail.mockResolvedValue(makeUser({ emailVerified: false }))

    const { service } = buildService({ userRepo, redisClient, emailService })

    const result = await service.resendOtp({ email: 'test@example.com' })

    expect(result).toEqual({ cooldownSeconds: 60 })
    expect(emailService.sendVerifyOtp).toHaveBeenCalledTimes(1)
  })

  it('email đã xác minh → ném BadRequestException', async () => {
    const redisClient = makeRedisClient()
    const userRepo = makeUserRepo()

    redisClient.get.mockResolvedValue(null)
    userRepo.findByEmail.mockResolvedValue(makeUser({ emailVerified: true }))

    const { service } = buildService({ userRepo, redisClient })

    await expect(
      service.resendOtp({ email: 'test@example.com' })
    ).rejects.toThrow(BadRequestException)
  })

  it('email không tồn tại → ném NotFoundException', async () => {
    const redisClient = makeRedisClient()
    const userRepo = makeUserRepo()

    redisClient.get.mockResolvedValue(null)
    userRepo.findByEmail.mockResolvedValue(null)

    const { service } = buildService({ userRepo, redisClient })

    await expect(
      service.resendOtp({ email: 'ghost@example.com' })
    ).rejects.toThrow(NotFoundException)
  })
})

// ─── TC-01-05 ─────────────────────────────────────────────────────────────────

describe('TC-01-05: Làm mới token khi access token hết hạn', () => {
  it('refresh token hợp lệ → trả về access + refresh token mới, lưu token mới vào Redis', async () => {
    const userRepo = makeUserRepo()
    const tokenService = makeTokenService()

    tokenService.verifyRefreshToken.mockReturnValue({ sub: 'user-id' })
    tokenService.validateStoredRefreshToken.mockResolvedValue(true)
    tokenService.generateAccessToken.mockReturnValue('new-access-token')
    tokenService.generateRefreshToken.mockReturnValue('new-refresh-token')
    tokenService.storeRefreshToken.mockResolvedValue(undefined)

    userRepo.findById.mockResolvedValue(makeUser())

    const { service } = buildService({ userRepo, tokenService })

    const result = await service.refresh('valid-refresh-token')

    expect(result).toMatchObject({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      role: 'CUSTOMER'
    })
    expect(tokenService.storeRefreshToken).toHaveBeenCalledWith(
      'user-id',
      'new-refresh-token'
    )
  })

  it('refresh token không khớp bản lưu trong Redis → ném UnauthorizedException', async () => {
    const userRepo = makeUserRepo()
    const tokenService = makeTokenService()

    tokenService.verifyRefreshToken.mockReturnValue({ sub: 'user-id' })
    tokenService.validateStoredRefreshToken.mockResolvedValue(false)

    const { service } = buildService({ userRepo, tokenService })

    await expect(service.refresh('stale-token')).rejects.toThrow(
      UnauthorizedException
    )
  })

  it('chữ ký JWT sai → ném UnauthorizedException', async () => {
    const userRepo = makeUserRepo()
    const tokenService = makeTokenService()

    tokenService.verifyRefreshToken.mockImplementation(() => {
      throw new Error('invalid signature')
    })

    const { service } = buildService({ userRepo, tokenService })

    await expect(service.refresh('bad-token')).rejects.toThrow(
      UnauthorizedException
    )
  })

  it('user không còn tồn tại trong DB → ném UnauthorizedException', async () => {
    const userRepo = makeUserRepo()
    const tokenService = makeTokenService()

    tokenService.verifyRefreshToken.mockReturnValue({ sub: 'ghost-id' })
    tokenService.validateStoredRefreshToken.mockResolvedValue(true)
    userRepo.findById.mockResolvedValue(null)

    const { service } = buildService({ userRepo, tokenService })

    await expect(service.refresh('valid-token')).rejects.toThrow(
      UnauthorizedException
    )
  })

  it('tài khoản bị ban sau khi refresh token được cấp → ném UnauthorizedException', async () => {
    const userRepo = makeUserRepo()
    const tokenService = makeTokenService()

    tokenService.verifyRefreshToken.mockReturnValue({ sub: 'user-id' })
    tokenService.validateStoredRefreshToken.mockResolvedValue(true)
    userRepo.findById.mockResolvedValue(makeUser({ status: 'BANNED' }))

    const { service } = buildService({ userRepo, tokenService })

    await expect(service.refresh('valid-token')).rejects.toThrow(
      UnauthorizedException
    )
  })
})
