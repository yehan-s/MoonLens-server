import { 
  Injectable, 
  UnauthorizedException, 
  ConflictException,
  BadRequestException,
  ForbiddenException 
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './services/password.service';
import { JwtTokenService } from './services/jwt.service';
import { UserRole } from '@prisma/client';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

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
    const passwordValidation = this.passwordService.validatePasswordStrength(dto.password);
    if (!passwordValidation.isValid) {
      throw new BadRequestException({
        message: '密码不符合要求',
        errors: passwordValidation.errors,
      });
    }

    // 哈希密码
    const hashedPassword = await this.passwordService.hashPassword(dto.password);

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
    const { token: accessToken, expiresIn } = await this.jwtTokenService.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const { token: refreshToken } = await this.jwtTokenService.generateRefreshToken(user.id);

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
      await this.recordLoginAttempt(dto.email, false, ipAddress, userAgent, '邮箱或密码错误');
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

    // 生成令牌
    const { token: accessToken, expiresIn } = await this.jwtTokenService.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const { token: refreshToken } = await this.jwtTokenService.generateRefreshToken(
      user.id,
      dto.deviceId,
    );

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
        id: sessionId,
        userId,
      },
    });

    if (!session) {
      throw new BadRequestException('会话不存在');
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { isActive: false },
    });

    return { message: '会话已终止' };
  }
}