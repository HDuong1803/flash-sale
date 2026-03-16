// user.controller.ts

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ResponseInterceptor } from '@common/interceptors'
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
import { AccessTokenGuard, AdminGuard } from '@common/guards'
import { AdminService } from '../services'

const moduleName = 'admin'

@ApiTags(moduleName)
@Controller(moduleName)
@UseInterceptors(ResponseInterceptor)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @ApiOperation({ summary: 'Get admin dashboard statistics' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, AdminGuard)
  @Get('dashboard')
  @HttpCode(HttpStatus.OK)
  async getAdminDashboardStats(
    @Query() query: AdminDashboardDto
  ): Promise<any> {
    return await this.adminService.getAdminDashboardStats(query)
  }

  @ApiOperation({ summary: 'Get list subscription' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, AdminGuard)
  @Get('subscription/list')
  @HttpCode(HttpStatus.OK)
  async getListSubscriptionPlans(
    @Query() query: GetListSubscriptionPlansDto
  ): Promise<IGetListSubscriptionPlansOutput> {
    return await this.adminService.getListSubscriptionPlans(query)
  }

  @ApiOperation({ summary: 'Create subscription plan' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, AdminGuard)
  @ApiBody({ type: createSubscriptionPlanDto })
  @Post('subscription/create')
  @HttpCode(HttpStatus.OK)
  async createSubscriptionPlan(
    @Body() createData: createSubscriptionPlanDto
  ): Promise<void> {
    return await this.adminService.createSubscriptionPlan(createData)
  }

  @ApiOperation({ summary: 'Update subscription plan' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, AdminGuard)
  @Put('subscription/:subscriptionPlansId')
  @HttpCode(HttpStatus.OK)
  async updateSubscriptionPlans(
    @Param('subscriptionPlansId') subscriptionPlansId: number,
    @Body() updateData: createSubscriptionPlanDto
  ): Promise<void> {
    return await this.adminService.updateSubscriptionPlans(
      subscriptionPlansId,
      updateData
    )
  }

  @ApiOperation({ summary: 'Remove subscription plan' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, AdminGuard)
  @Delete('subscription/:subscriptionPlansId')
  @HttpCode(HttpStatus.OK)
  async removeSubscriptionPlans(
    @Param('subscriptionPlansId') subscriptionPlansId: number
  ): Promise<void> {
    return await this.adminService.removeSubscriptionPlans(subscriptionPlansId)
  }

  @ApiOperation({ summary: 'Get list transactions' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, AdminGuard)
  @Get('get-transactions')
  @HttpCode(HttpStatus.OK)
  async getListTransactions(
    @Query() query: AdminTransactionContractDto
  ): Promise<IGetListContractTransactionsOutput> {
    return await this.adminService.getListTransactions(query)
  }

  @ApiOperation({ summary: 'Get list network fees' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, AdminGuard)
  @Get('network-fees')
  @HttpCode(HttpStatus.OK)
  async getTransactionNetworkFees(
    @Query() query: AdminTransactionDto
  ): Promise<IGetListTransactionsOutput> {
    return await this.adminService.getTransactionNetworkFees(query)
  }

  @ApiOperation({ summary: 'Block user' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, AdminGuard)
  @ApiBody({ type: BlockUserDto })
  @Post('block-user')
  @HttpCode(HttpStatus.OK)
  async BlockUser(@Body() dto: BlockUserDto): Promise<void> {
    return await this.adminService.BlockUser(dto)
  }

  @ApiOperation({ summary: 'Change role user' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, AdminGuard)
  @ApiBody({ type: ChangeRoleDto })
  @Post('change-role')
  @HttpCode(HttpStatus.OK)
  async changeUserRole(@Body() dto: ChangeRoleDto): Promise<void> {
    return await this.adminService.changeUserRole(dto)
  }

  @ApiOperation({ summary: 'Get list network fees' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, AdminGuard)
  @Get('get-users')
  @HttpCode(HttpStatus.OK)
  async getListUsers(
    @Query() query: getListUsersDto
  ): Promise<IGetListUsersOutput> {
    return await this.adminService.getListUsers(query)
  }

  @ApiOperation({ summary: 'Reset Manifesto' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AccessTokenGuard, AdminGuard)
  @ApiBody({ type: ResetManifestoDto })
  @Post('manifesto')
  @HttpCode(HttpStatus.OK)
  async resetManifestoDto(@Body() dto: ResetManifestoDto): Promise<void> {
    return await this.adminService.resetManifestoDto(dto)
  }
}
