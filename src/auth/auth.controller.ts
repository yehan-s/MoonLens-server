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
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { UserRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { TOTPService } from './services/totp.service';
import { Enable2FADto } from './dto/enable-2fa.dto';
import { Disable2FADto } from './dto/disable-2fa.dto';
import { Verify2FADto } from './dto/verify-2fa.dto';

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
    // 为前端客户端（MoonLens-client）的 Axios 包装器保持兼容：
    // 该客户端在 refresh 接口上期望 ApiResponse<T> 结构（即 { data: { accessToken, refreshToken?, expiresIn } }），
    // 而登录接口返回的则是原始对象（非 ApiResponse）。
    // 因此，这里对刷新结果进行 data 包装，避免出现前端 response.data 为 undefined 的问题。
    const result = await this.authService.refreshToken(refreshTokenDto);
    return { success: true, data: result };
  }

  /**
   * 请求密码重置（发送重置令牌）
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '请求密码重置' })
  @ApiResponse({ status: 200, description: '如果邮箱存在，将发送重置指引' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return await this.authService.forgotPassword(dto.email);
  }

  /**
   * 重置密码
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重置密码' })
  @ApiResponse({ status: 200, description: '密码已重置' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return await this.authService.resetPassword(dto.token, dto.newPassword);
  }

  /**
   * 用户登出
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.ADMIN)
  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户信息' })
  @ApiResponse({
    status: 200,
    description: '返回用户信息',
  })
  async getProfile(@CurrentUser() user: any) {
    return {
      id: user.userId,
      userId: user.userId,
      email: user.email,
      username: user.username,
      role: user.role,
    };
  }

  /**
   * 修改密码
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.ADMIN)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: '修改密码' })
  @ApiResponse({
    status: 200,
    description: '密码修改成功',
  })
  @ApiResponse({
    status: 400,
    description: '当前密码不正确或新密码不符合要求',
  })
  async changePassword(
    @CurrentUser() user: any,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return await this.authService.changePassword(
      user.userId,
      changePasswordDto.oldPassword,
      changePasswordDto.newPassword,
    );
  }

  /**
   * 获取登录历史
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER, UserRole.ADMIN)
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

  // 注释掉旧的 GitLab OAuth 实现，已迁移到 GitLabOAuthController
  /*
  @Public()
  @Get('gitlab')
  @UseGuards(AuthGuard('gitlab'))
  @ApiOperation({ summary: 'GitLab OAuth 登录' })
  gitlabLogin() {
    // 重定向到 GitLab 授权页
  }

  @Public()
  @Get('gitlab/callback')
  @UseGuards(AuthGuard('gitlab'))
  @ApiOperation({ summary: 'GitLab OAuth 回调' })
  async gitlabCallback(@Request() req: any, @Res() res: any) {
    // 策略 validate 返回的 user
    const user = req.user;
    const tokens = await this.authService.issueTokensForUser(user.id);
    
    // 重定向到前端，带上 token 信息
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
    const redirectUrl = `${frontendUrl}/oauth/gitlab/callback?token=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`;
    
    return res.redirect(redirectUrl);
  }
  */

  // 2FA：生成 secret 与 otpauth url（需已登录）
  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  @ApiBearerAuth()
  @ApiOperation({ summary: '2FA 预备：生成密钥与 otpauthURI（不落库）' })
  async twoFASetup(@CurrentUser() user: any) {
    return await this.authService.twoFASetup(user.userId);
  }

  // 2FA：启用
  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  @ApiBearerAuth()
  @ApiOperation({ summary: '启用 2FA' })
  async enable2FA(@CurrentUser() user: any, @Body() dto: Enable2FADto) {
    return await this.authService.enable2FA(user.userId, dto.secret, dto.code);
  }

  // 2FA：关闭
  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  @ApiBearerAuth()
  @ApiOperation({ summary: '关闭 2FA' })
  async disable2FA(@CurrentUser() user: any, @Body() dto: Disable2FADto) {
    return await this.authService.disable2FA(user.userId, dto.code);
  }

  // 2FA：挑战令牌校验并颁发 JWT
  @Public()
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '2FA 挑战验证并颁发 JWT' })
  async verify2FA(@Body() dto: Verify2FADto, @Headers('user-agent') userAgent: string, @Ip() ip: string) {
    // 解析 twoFactorToken
    const payload: any = await (this as any).authService['jwtTokenService']['jwtService'].verifyAsync(dto.twoFactorToken);
    if (payload.type !== '2fa') {
      return { message: '挑战令牌无效' };
    }
    // 验证 TOTP
    const user = await (this as any).authService['prisma'].user.findUnique({ where: { id: payload.userId }, select: { twoFactorSecret: true } });
    if (!user?.twoFactorSecret) return { message: '未启用 2FA' };
    const secret = require('../common/utils/crypto.util')['decryptSecret'](user.twoFactorSecret);
    const ok = require('otplib').authenticator.check(dto.code, secret);
    if (!ok) return { message: '验证码无效' };
    // 颁发令牌与创建会话
    return await this.authService.issueTokensForUser(payload.userId, dto.deviceId, ip, userAgent);
  }
}
