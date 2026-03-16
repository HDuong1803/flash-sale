// update-profile.dto.ts

import { ApiProperty } from '@nestjs/swagger'
import { UserStatus } from '@prisma/client'
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber
} from 'class-validator'
import { Type } from 'class-transformer'

export enum TransactionType {
  ALL = 'ALL',
  COMPLETE = 'COMPLETE',
  PENDING = 'PENDING',
  FAIL = 'FAIL'
}

export enum SuiTransactionType {
  MINT = 'MINT',
  TRANSFER = 'TRANSFER',
  BURN = 'BURN',
  STAMP_CREATED = 'STAMP_CREATED',
  STAMP_SIGNED = 'STAMP_SIGNED',
  CREATE_FILE = 'CREATE_FILE',
  GRANT_ACCESS = 'GRANT_ACCESS',
  REVOKE_ACCESS = 'REVOKE_ACCESS',
  SIGN_MANIFESTO = 'SIGN_MANIFESTO',
  MINT_MANIFESTO = 'MINT_MANIFESTO'
}

export class AdminDashboardDto {
  @ApiProperty({
    enum: TransactionType,
    required: false,
    description: 'type of transactions to filter',
    example: 'ALL'
  })
  @IsEnum(TransactionType)
  @IsOptional()
  type: TransactionType

  @ApiProperty({
    required: false,
    type: 'string',
    description: 'start date in ISO format',
    example: '2024-01-01T00:00:00.000Z'
  })
  @IsString()
  @IsOptional()
  fromDate?: string

  @ApiProperty({
    required: false,
    type: 'string',
    description: 'end date in ISO format',
    example: '2024-01-31T23:59:59.999Z'
  })
  @IsString()
  @IsOptional()
  toDate?: string
}

export class GetListSubscriptionPlansDto {
  @ApiProperty({
    required: false,
    type: 'boolean',
    description:
      'Filter by active status: undefined for all, true for active, false for inactive',
    example: true
  })
  @IsOptional()
  isActive?: boolean

  @ApiProperty({
    required: false,
    type: 'number',
    description: 'Page number for pagination',
    example: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number

  @ApiProperty({
    required: false,
    type: 'number',
    description: 'Number of items per page for pagination',
    example: 10
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number
}

export class createSubscriptionPlanDto {
  @ApiProperty({
    type: 'string',
    description: 'Name of the subscription plan',
    example: 'Pro Plan'
  })
  @IsString()
  name: string

  @ApiProperty({
    type: 'number',
    description: 'Monthly price for the plan',
    example: 9.99
  })
  @IsNotEmpty()
  monthlyPrice: number

  @ApiProperty({
    type: 'number',
    description: 'Yearly price for the plan',
    example: 99.99
  })
  @IsNotEmpty()
  yearlyPrice: number

  @ApiProperty({
    required: false,
    type: 'number',
    description: 'Yearly discount percent',
    example: 10
  })
  @IsOptional()
  yearlyDiscountPercent?: number

  @ApiProperty({
    type: 'number',
    description: 'Maximum number of users allowed',
    example: 10
  })
  @IsNotEmpty()
  maxUsers: number

  @ApiProperty({
    type: 'number',
    description: 'Maximum number of contracts allowed',
    example: 50
  })
  @IsNotEmpty()
  maxContracts: number

  @ApiProperty({
    type: 'number',
    description: 'Maximum number of signatures allowed',
    example: 100
  })
  @IsNotEmpty()
  maxSignatures: number

  @ApiProperty({
    type: 'number',
    description: 'Drive storage quota (e.g., "10GB")',
    example: 10
  })
  @IsNumber()
  @IsNotEmpty()
  maxDriveStorage: number

  @ApiProperty({
    type: 'number',
    description: 'Maximum number of corporations',
    example: 1
  })
  @IsNotEmpty()
  maxCorporation: number

  @ApiProperty({
    type: 'number',
    description: 'Maximum number of groups',
    example: 5
  })
  @IsNotEmpty()
  maxGroup: number

  @ApiProperty({
    required: false,
    type: 'boolean',
    description: 'Whether employee management is enabled for the plan',
    example: false
  })
  @IsOptional()
  isEmployeeManagementEnabled?: boolean

  @ApiProperty({
    required: false,
    type: 'boolean',
    description: 'Whether API access is enabled for the plan',
    example: false
  })
  @IsOptional()
  isApiAccessEnabled?: boolean

  @ApiProperty({
    required: false,
    type: 'boolean',
    description: 'Whether the plan is active',
    example: true
  })
  @IsOptional()
  isActive?: boolean
}

export class AdminTransactionContractDto {
  @ApiProperty({
    type: 'number',
    required: false,
    description: 'Page number for pagination',
    example: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number

  @ApiProperty({
    type: 'number',
    required: false,
    description: 'Number of items per page for pagination',
    example: 10
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number

  @ApiProperty({
    type: 'string',
    required: false,
    description: 'Start date in ISO format',
    example: '2024-01-01T00:00:00.000Z'
  })
  @IsOptional()
  @IsString()
  fromDate?: string

  @ApiProperty({
    type: 'string',
    required: false,
    description: 'End date in ISO format',
    example: '2024-01-31T23:59:59.999Z'
  })
  @IsOptional()
  @IsString()
  toDate?: string

  @ApiProperty({
    type: 'number',
    required: false,
    description: 'Filter by user id',
    example: 123
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  userId?: number

  @ApiProperty({
    type: 'number',
    required: false,
    description: 'Filter by contract (prePair) id',
    example: 456
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  prePairId?: number

  @ApiProperty({
    type: 'number',
    required: false,
    description: 'Filter by signature id',
    example: 789
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  signatureId?: number

  @ApiProperty({
    type: 'string',
    required: false,
    description: 'Filter by status (e.g. SEND, REJECT, COMPLETE)',
    example: 'SEND'
  })
  @IsOptional()
  @IsString()
  status?: string

  @ApiProperty({
    type: 'string',
    required: false,
    description: 'Search string (e.g. file name)',
    example: 'contract.pdf'
  })
  @IsString()
  @IsOptional()
  searchString?: string
}

export class AdminTransactionDto {
  @ApiProperty({
    type: 'number',
    required: false,
    description: 'Page number for pagination',
    example: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number

  @ApiProperty({
    type: 'number',
    required: false,
    description: 'Number of items per page for pagination',
    example: 10
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number

  @ApiProperty({
    type: 'string',
    required: false,
    description: 'Start date in ISO format',
    example: '2024-01-01T00:00:00.000Z'
  })
  @IsOptional()
  @IsString()
  fromDate?: string

  @ApiProperty({
    type: 'string',
    required: false,
    description: 'End date in ISO format',
    example: '2024-01-31T23:59:59.999Z'
  })
  @IsOptional()
  @IsString()
  toDate?: string

  @ApiProperty({
    type: 'number',
    required: false,
    description: 'Filter by user id',
    example: 123
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  userId?: number

  @ApiProperty({
    enum: TransactionType,
    required: false,
    description: 'Type of transactions to filter',
    example: TransactionType.ALL
  })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType

  @ApiProperty({
    required: false,
    type: 'string',
    description: 'Search string (e.g. file name)',
    example: 'contract.pdf'
  })
  @IsOptional()
  @IsString()
  searchString?: string
}

export class BlockUserDto {
  @ApiProperty({
    type: 'number',
    description: 'ID of the user to be blocked',
    example: 123
  })
  @IsNumber()
  @IsNotEmpty()
  userId: number

  @ApiProperty({
    type: 'boolean',
    description: 'Whether to block or unblock the user',
    example: true
  })
  @IsOptional()
  isBlocked?: boolean
}

export class ChangeRoleDto {
  @ApiProperty({
    type: 'number',
    description: 'ID of the target user whose role is to be changed',
    example: 123
  })
  @IsNumber()
  @IsNotEmpty()
  targetUserId: number

  @ApiProperty({
    type: 'string',
    description: 'New role to be assigned to the user',
    example: 'ADMIN'
  })
  @IsString()
  role: string

  @ApiProperty({
    type: 'number',
    required: false,
    description: 'ID of the corporation (if applicable)',
    example: 456
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  corporationId?: number

  @ApiProperty({
    type: 'number',
    required: false,
    description: 'ID of the group (if applicable)',
    example: 789
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  groupId?: number
}

export class getListUsersDto {
  @ApiProperty({
    type: 'number',
    required: false,
    description: 'Page number for pagination',
    example: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number

  @ApiProperty({
    type: 'number',
    required: false,
    description: 'Number of items per page for pagination',
    example: 10
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number

  @ApiProperty({
    type: 'boolean',
    required: false,
    description:
      'Filter by active status: undefined for all, true for active, false for inactive',
    example: true
  })
  @IsOptional()
  filterActive?: boolean

  @ApiProperty({
    type: 'boolean',
    required: false,
    description:
      'Filter by blocked status: undefined for all, true for blocked, false for not blocked',
    example: false
  })
  @IsOptional()
  filterBlocked?: boolean

  @ApiProperty({
    type: 'string',
    required: false,
    description: 'Filter by user role: EMPLOYEE, VIEWER, ADMIN, SUPER_ADMIN',
    example: 'ADMIN'
  })
  @IsString()
  @IsOptional()
  filterRole?: string

  @ApiProperty({
    type: 'string',
    required: false,
    description: 'Search string to filter users by name or email',
    example: 'john.doe@example.com'
  })
  @IsString()
  @IsOptional()
  searchString?: string
}

export class ResetManifestoDto {
  @ApiProperty({
    type: 'number',
    description: 'ID of the user to reset manifesto for',
    example: 123
  })
  @IsNumber()
  @IsNotEmpty()
  userId: number
}

export interface IContractTransactionOutput {
  prePairId: number
  contractName: string
  userId: number
  userEmail: string
  status: string
  date: Date | string
  participants: number
  signatureId?: number
}

export interface IGetListContractTransactionsOutput {
  data: IContractTransactionOutput[]
  total: number
}

export interface SuiTransaction {
  txId: string
  userId: number
  nftsId: string | null
  walletAddress: string
  amountFees: string | number
  txHash: string
  checkpoint: string | number
  type: TransactionType
  created: string | Date
  suiExplorerUrl: string
}

export interface IGetListTransactionsOutput {
  totalFeesGlobal: number
  transactions: SuiTransaction[]
  totalTransactions: number
}

export interface ISubscriptionPlan {
  subscriptionPlansId: number
  name: string
  monthlyPrice: number
  yearlyPrice: number
  yearlyDiscountPercent: number
  maxUsers: number
  maxContracts: number
  maxSignatures: number
  maxDriveStorage: string
  maxCorporation: number
  maxGroup: number
  isEmployeeManagementEnabled: boolean
  isApiAccessEnabled: boolean
  isActive: boolean
  created: Date
  modified?: Date
}

export interface IGetListSubscriptionPlansOutput {
  plans: ISubscriptionPlan[]
  total: number
}

export interface IUserOutput {
  userId: number
  email: string
  firstName: string
  lastName: string
  userRole: string
  isBlocked: boolean
  kycStatus: UserStatus
  lastLoginAt?: Date | string
  recentActions: { action: string; date: Date | string }[]
  transactions: {
    totalFees: number
    transactionDetails: Array<{
      txId: number
      txHash: string
      amountFees: number
      type: string
      checkpoint: string
      created: string | Date
    }>
  }
}

export interface IGetListUsersOutput {
  data: IUserOutput[]
  total: number
}
