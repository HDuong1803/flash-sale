// admin.service.ts — stubbed for Flash Sale schema (Session 7 will rewrite)

import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '@local-prisma/prisma.service'
import { RedisService } from '@redis/redis.service'
import {
  AdminDashboardDto,
  AdminTransactionContractDto,
  AdminTransactionDto,
  BlockUserDto,
  ChangeRoleDto,
  createSubscriptionPlanDto,
  GetListSubscriptionPlansDto,
  getListUsersDto,
  IGetListContractTransactionsOutput,
  IGetListSubscriptionPlansOutput,
  IGetListTransactionsOutput,
  IGetListUsersOutput,
  ResetManifestoDto
} from '../dto/admin.dto'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name)

  constructor(
    private prismaService: PrismaService,
    private redisService: RedisService,
    private configService: ConfigService
  ) {}

  public async getAdminDashboardStats(_query: AdminDashboardDto): Promise<any> {
    return Promise.resolve(null as any)
  }

  public async getListSubscriptionPlans(
    _query: GetListSubscriptionPlansDto
  ): Promise<IGetListSubscriptionPlansOutput> {
    return Promise.resolve(null as any)
  }

  public async createSubscriptionPlan(
    _createData: createSubscriptionPlanDto
  ): Promise<void> {
    return Promise.resolve()
  }

  public async updateSubscriptionPlans(
    _subscriptionPlansId: number,
    _updateData: createSubscriptionPlanDto
  ): Promise<void> {
    return Promise.resolve()
  }

  public async removeSubscriptionPlans(
    _subscriptionPlansId: number
  ): Promise<void> {
    return Promise.resolve()
  }

  public async getListTransactions(
    _query: AdminTransactionContractDto
  ): Promise<IGetListContractTransactionsOutput> {
    return Promise.resolve(null as any)
  }

  public async getTransactionNetworkFees(
    _query: AdminTransactionDto
  ): Promise<IGetListTransactionsOutput> {
    return Promise.resolve(null as any)
  }

  public async BlockUser(_dto: BlockUserDto): Promise<void> {
    return Promise.resolve()
  }

  public async changeUserRole(_dto: ChangeRoleDto): Promise<void> {
    return Promise.resolve()
  }

  public async getListUsers(
    _query: getListUsersDto
  ): Promise<IGetListUsersOutput> {
    return Promise.resolve(null as any)
  }

  public async resetManifestoDto(_dto: ResetManifestoDto): Promise<void> {
    return Promise.resolve()
  }
}
