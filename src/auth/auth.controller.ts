import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Request,
  Headers,
  Ip,
  HttpCode,
  HttpStatus,
  Param,
  Delete,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

/**
 * 认证控制器
 * 处理用户注册、登录、登出等认证相关的HTTP请求
 */
@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 用户注册
   */
  @Public()
  @Post('register')
  @ApiOperation({ summary: '用户注册' })
  @ApiResponse({
    status: 201,
    description: '注册成功',
  })
  @ApiResponse({
    status: 409,
    description: '邮箱或用户名已存在',
  })
  async register(@Body() registerDto: RegisterDto) {
    return await this.authService.register(registerDto);
  }

  /**
   * 用户登录
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用户登录' })
  @ApiResponse({
    status: 200,
    description: '登录成功',
  })
  @ApiResponse({
    status: 401,
    description: '认证失败',
  })
  async login(
    @Body() loginDto: LoginDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return await this.authService.login(loginDto, ipAddress, userAgent);
  }

  /**
   * 刷新访问令牌
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '刷新访问令牌' })
  @ApiResponse({
    status: 200,
    description: '刷新成功',
  })
  @ApiResponse({
    status: 401,
    description: '刷新令牌无效',
  })
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return await this.authService.refreshToken(refreshTokenDto);
  }

  /**
   * 用户登出
   */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: '用户登出' })
  @ApiResponse({
    status: 200,
    description: '登出成功',
  })
  async logout(
    @Headers('authorization') authHeader: string,
    @Body('refreshToken') refreshToken?: string,
  ) {
    const accessToken = authHeader?.replace('Bearer ', '');
    return await this.authService.logout(accessToken, refreshToken);
  }

  /**
   * 从所有设备登出
   */
  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: '从所有设备登出' })
  @ApiResponse({
    status: 200,
    description: '已从所有设备登出',
  })
  async logoutAllDevices(@CurrentUser() user: any) {
    return await this.authService.logoutAllDevices(user.userId);
  }

  /**
   * 获取当前用户信息
   */
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户信息' })
  @ApiResponse({
    status: 200,
    description: '返回用户信息',
  })
  async getProfile(@CurrentUser() user: any) {
    return {
      userId: user.userId,
      email: user.email,
      username: user.username,
      role: user.role,
    };
  }

  /**
   * 获取登录历史
   */
  @UseGuards(JwtAuthGuard)
  @Get('login-history')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取登录历史' })
  @ApiResponse({
    status: 200,
    description: '返回登录历史记录',
  })
  async getLoginHistory(@CurrentUser() user: any) {
    return await this.authService.getLoginHistory(user.userId);
  }

  /**
   * 获取活跃会话
   */
  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取活跃会话' })
  @ApiResponse({
    status: 200,
    description: '返回活跃会话列表',
  })
  async getActiveSessions(@CurrentUser() user: any) {
    return await this.authService.getActiveSessions(user.userId);
  }

  /**
   * 终止指定会话
   */
  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: '终止指定会话' })
  @ApiResponse({
    status: 200,
    description: '会话已终止',
  })
  async terminateSession(
    @CurrentUser() user: any,
    @Param('sessionId') sessionId: string,
  ) {
    return await this.authService.terminateSession(user.userId, sessionId);
  }
}