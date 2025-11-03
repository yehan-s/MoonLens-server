import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './services/password.service';
import { JwtTokenService } from './services/jwt.service';
import { UserRole } from '@prisma/client';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { randomUUID } from 'crypto';
import { encryptSecret, decryptSecret } from '../common/utils/crypto.util';
import { TOTPService } from './services/totp.service';

/**
 * 认证服务
 * 处理用户注册、登录、登出等认证逻辑
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly totpService: TOTPService,
  ) {}

  /**
   * 用户注册
   */
  async register(dto: RegisterDto) {
    // 检查邮箱是否已存在
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('该邮箱已被注册');
    }

    // 检查用户名是否已存在
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (existingUsername) {
      throw new ConflictException('该用户名已被使用');
    }

    // 验证密码强度
    const passwordValidation = this.passwordService.validatePasswordStrength(
      dto.password,
    );
    if (!passwordValidation.isValid) {
      throw new BadRequestException({
        message: '密码不符合要求',
        errors: passwordValidation.errors,
      });
    }

    // 哈希密码
    const hashedPassword = await this.passwordService.hashPassword(
      dto.password,
    );

    // 创建用户
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        password: hashedPassword,
        fullName: dto.fullName,
        role: UserRole.USER,
      },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        role: true,
        createdAt: true,
      },
    });

    // 生成访问令牌和刷新令牌
    const { token: accessToken, expiresIn } =
      await this.jwtTokenService.generateAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

    const { token: refreshToken } =
      await this.jwtTokenService.generateRefreshToken(user.id);

    return {
      user,
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  /**
   * 用户登录
   */
  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.validateUser(dto.email, dto.password);

    if (!user) {
      // 记录失败的登录尝试
      await this.recordLoginAttempt(
        dto.email,
        false,
        ipAddress,
        userAgent,
        '邮箱或密码错误',
      );
      throw new UnauthorizedException('邮箱或密码错误');
    }

    // 检查账户是否被锁定
    if (user.isLocked) {
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new ForbiddenException('账户已被锁定，请稍后再试');
      } else {
        // 解锁账户
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            isLocked: false,
            lockedUntil: null,
            loginAttempts: 0,
          },
        });
      }
    }

    // 记录成功的登录
    await this.recordLoginAttempt(dto.email, true, ipAddress, userAgent);

    // 更新最后登录信息
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
        loginAttempts: 0, // 重置登录尝试次数
      },
    });

    // 若启用 2FA，仅返回挑战令牌
    if (user.twoFactorEnabled) {
      const two = await this.jwtTokenService.generateTwoFactorToken(user.id);
      return { need2fa: true, twoFactorToken: two.token, expiresIn: two.expiresIn };
    }

    // 生成令牌
    const { token: accessToken, expiresIn } =
      await this.jwtTokenService.generateAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

    const sessionId = randomUUID();
    const { token: refreshToken } =
      await this.jwtTokenService.generateRefreshToken(user.id, dto.deviceId);

    // 记录会话
    await this.prisma.session.create({
      data: {
        userId: user.id,
        sessionId,
        deviceId: dto.deviceId || null,
        deviceName: userAgent || null,
        ipAddress: ipAddress || 'unknown',
        userAgent: userAgent || 'unknown',
        isActive: true,
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        avatar: user.avatar,
      },
      accessToken,
      refreshToken,
      sessionId,
      expiresIn,
    };
  }

  /**
   * 验证用户凭据
   */
  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return null;
    }

    // 验证密码
    const isPasswordValid = await this.passwordService.verifyPassword(
      password,
      user.password,
    );

    if (!isPasswordValid) {
      // 增加失败登录次数
      const attempts = user.loginAttempts + 1;
      const updateData: any = { loginAttempts: attempts };

      // 如果失败次数达到5次，锁定账户15分钟
      if (attempts >= 5) {
        updateData.isLocked = true;
        updateData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15分钟
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });

      return null;
    }

    // 检查用户状态
    if (!user.isActive) {
      throw new ForbiddenException('用户账户已被禁用');
    }

    return user;
  }

  /**
   * 刷新访问令牌
   */
  async refreshToken(dto: RefreshTokenDto) {
    return await this.jwtTokenService.refreshAccessToken(dto.refreshToken);
  }

  /**
   * 用户登出
   */
  async logout(accessToken: string, refreshToken?: string) {
    // 撤销访问令牌
    await this.jwtTokenService.revokeToken(accessToken, 'logout');

    // 如果提供了刷新令牌，也撤销它
    if (refreshToken) {
      await this.jwtTokenService.revokeToken(refreshToken, 'logout');
    }

    return { message: '登出成功' };
  }

  /**
   * 登出所有设备
   */
  async logoutAllDevices(userId: string) {
    await this.jwtTokenService.revokeAllUserTokens(userId, 'logout_all');
    // 关闭所有会话
    await this.prisma.session.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
    return { message: '已从所有设备登出' };
  }

  /**
   * 记录登录尝试
   */
  private async recordLoginAttempt(
    email: string,
    success: boolean,
    ipAddress?: string,
    userAgent?: string,
    failReason?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (user) {
      await this.prisma.loginHistory.create({
        data: {
          userId: user.id,
          ipAddress: ipAddress || 'unknown',
          userAgent: userAgent || 'unknown',
          success,
          failReason,
        },
      });
    }
  }

  /**
   * 获取用户的登录历史
   */
  async getLoginHistory(userId: string, limit: number = 10) {
    return await this.prisma.loginHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        deviceType: true,
        browser: true,
        os: true,
        location: true,
        success: true,
        failReason: true,
        createdAt: true,
      },
    });
  }

  /**
   * 获取用户的活跃会话
   */
  async getActiveSessions(userId: string) {
    return await this.prisma.session.findMany({
      where: {
        userId,
        isActive: true,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: { lastActivity: 'desc' },
      select: {
        id: true,
        sessionId: true,
        deviceId: true,
        deviceName: true,
        ipAddress: true,
        location: true,
        lastActivity: true,
        createdAt: true,
      },
    });
  }

  /**
   * 终止指定会话
   */
  async terminateSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: {
        sessionId,
        userId,
      },
    });

    if (!session) {
      throw new BadRequestException('会话不存在');
    }

    await this.prisma.session.updateMany({
      where: { sessionId, userId },
      data: { isActive: false },
    });

    return { message: '会话已终止' };
  }

  /**
   * 签发指定用户的令牌（用于 2FA 验证通过后）
   */
  async issueTokensForUser(userId: string, deviceId?: string, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('用户不存在');

    const sessionId = randomUUID();
    const { token: accessToken, expiresIn } = await this.jwtTokenService.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });
    const { token: refreshToken } = await this.jwtTokenService.generateRefreshToken(user.id, deviceId);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        sessionId,
        deviceId: deviceId || null,
        deviceName: userAgent || null,
        ipAddress: ipAddress || 'unknown',
        userAgent: userAgent || 'unknown',
        isActive: true,
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        avatar: user.avatar,
      },
      accessToken,
      refreshToken,
      sessionId,
      expiresIn,
    };
  }

  /**
   * 2FA: 生成 secret 与 otpauth URL（仅返回不落库）
   */
  async twoFASetup(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) throw new BadRequestException('用户不存在');
    return this.totpService.generateSecret(user.email);
  }

  /**
   * 2FA: 启用
   */
  async enable2FA(userId: string, secret: string, code: string) {
    if (!this.totpService.verifyCode(secret, code)) {
      throw new BadRequestException('验证码无效');
    }
    const cipher = encryptSecret(secret);
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true, twoFactorSecret: cipher } });
    return { message: '2FA 已启用' };
  }

  /**
   * 2FA: 关闭
   */
  async disable2FA(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true, twoFactorSecret: true } });
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('尚未启用 2FA');
    }
    const secret = decryptSecret(user.twoFactorSecret);
    if (!this.totpService.verifyCode(secret, code)) {
      throw new BadRequestException('验证码无效');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
    return { message: '2FA 已关闭' };
  }

  /**
   * 请求密码重置
   */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
    // 为防止用户枚举，始终返回成功
    if (user) {
      const token = randomUUID();
      await this.prisma.passwordReset.create({
        data: {
          userId: user.id,
          email: user.email,
          token,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1小时
        },
      });
      // TODO: 发送邮件（此处先记录日志或集成实际邮件服务）
    }
    return { message: '如果邮箱存在，我们已发送重置指引' };
  }

  /**
   * 重置密码
   */
  async resetPassword(token: string, newPassword: string) {
    const pr = await this.prisma.passwordReset.findUnique({ where: { token } });
    if (!pr || pr.used || pr.expiresAt < new Date()) {
      throw new BadRequestException('重置令牌无效或已过期');
    }

    const hashed = await this.passwordService.hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: pr.userId }, data: { password: hashed } }),
      this.prisma.passwordReset.update({ where: { token }, data: { used: true } }),
    ]);

    // 撤销该用户所有 Token，强制重新登录
    await this.jwtTokenService.revokeAllUserTokens(pr.userId, 'password_reset');
    await this.prisma.session.updateMany({ where: { userId: pr.userId, isActive: true }, data: { isActive: false } });

    return { message: '密码已重置，请使用新密码登录' };
  }

  /**
   * 修改密码
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    // 获取用户信息
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 验证旧密码
    const isOldPasswordValid = await this.passwordService.verifyPassword(
      oldPassword,
      user.password,
    );

    if (!isOldPasswordValid) {
      throw new BadRequestException('当前密码不正确');
    }

    // 检查新密码不能与旧密码相同
    if (oldPassword === newPassword) {
      throw new BadRequestException('新密码不能与当前密码相同');
    }

    // 加密新密码
    const hashedPassword = await this.passwordService.hashPassword(newPassword);

    // 更新密码
    await this.prisma.user.update({
      where: { id: userId },
      data: { 
        password: hashedPassword,
        updatedAt: new Date(),
      },
    });

    // 记录密码修改日志
    await this.prisma.loginHistory.create({
      data: {
        userId,
        ipAddress: '127.0.0.1',
        userAgent: 'Password Changed',
        success: true,
        createdAt: new Date(),
      },
    });

    return { message: '密码修改成功' };
  }
}
