import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { randomUUID } from 'crypto';

/**
 * JWT Token 管理服务
 * 处理 Token 生成、验证、刷新和黑名单管理
 */
@Injectable()
export class JwtTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 生成访问令牌
   */
  async generateAccessToken(payload: {
    userId: string;
    email: string;
    role: string;
  }): Promise<{ token: string; expiresIn: number }> {
    const jti = randomUUID(); // JWT ID 用于黑名单管理
    const expiresIn = this.configService.get<number>('JWT_EXPIRES_IN', 3600); // 1小时

    const token = await this.jwtService.signAsync(
      {
        ...payload,
        jti,
        type: 'access',
      },
      {
        expiresIn,
      },
    );

    return {
      token,
      expiresIn,
    };
  }

  /**
   * 生成刷新令牌
   */
  async generateRefreshToken(
    userId: string,
    deviceId?: string,
  ): Promise<{ token: string; expiresIn: number }> {
    const jti = randomUUID();
    const expiresIn = this.configService.get<number>(
      'JWT_REFRESH_EXPIRES_IN',
      604800,
    ); // 7天

    const token = await this.jwtService.signAsync(
      {
        userId,
        jti,
        type: 'refresh',
      },
      {
        expiresIn,
      },
    );

    // 存储刷新令牌到数据库
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token,
        deviceId,
        expiresAt,
      },
    });

    return {
      token,
      expiresIn,
    };
  }

  /**
   * 生成 2FA 挑战令牌（短有效期）
   */
  async generateTwoFactorToken(userId: string): Promise<{ token: string; expiresIn: number }> {
    const expiresIn = 300; // 5 分钟
    const token = await this.jwtService.signAsync(
      {
        userId,
        type: '2fa',
      },
      { expiresIn },
    );
    return { token, expiresIn };
  }

  /**
   * 验证访问令牌
   */
  async validateAccessToken(token: string): Promise<any> {
    try {
      const payload = await this.jwtService.verifyAsync(token);

      // 检查是否在黑名单中
      const isBlacklisted = await this.isTokenBlacklisted(payload.jti);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token 已被撤销');
      }

      return payload;
    } catch (error) {
      throw new UnauthorizedException('无效的访问令牌');
    }
  }

  /**
   * 刷新访问令牌
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }> {
    try {
      // 验证刷新令牌
      const payload = await this.jwtService.verifyAsync(refreshToken);

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('无效的刷新令牌');
      }

      // 检查刷新令牌是否在数据库中存在且有效
      const storedToken = await this.prisma.refreshToken.findFirst({
        where: {
          token: refreshToken,
          userId: payload.userId,
          isActive: true,
          expiresAt: {
            gt: new Date(),
          },
        },
        include: {
          user: true,
        },
      });

      if (!storedToken) {
        throw new UnauthorizedException('刷新令牌无效或已过期');
      }

      // 更新最后使用时间
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { lastUsedAt: new Date() },
      });

      // 生成新的访问令牌
      const { token: accessToken, expiresIn } = await this.generateAccessToken({
        userId: storedToken.user.id,
        email: storedToken.user.email,
        role: storedToken.user.role,
      });

      // 如果刷新令牌即将过期（少于1天），生成新的刷新令牌
      const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      let newRefreshToken: string | undefined;

      if (storedToken.expiresAt < oneDayFromNow) {
        // 使旧的刷新令牌失效
        await this.prisma.refreshToken.update({
          where: { id: storedToken.id },
          data: { isActive: false },
        });

        // 生成新的刷新令牌
        const refreshResult = await this.generateRefreshToken(
          storedToken.userId,
          storedToken.deviceId || undefined,
        );
        newRefreshToken = refreshResult.token;
      }

      return {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn,
      };
    } catch (error) {
      throw new UnauthorizedException('刷新令牌验证失败');
    }
  }

  /**
   * 撤销令牌（加入黑名单）
   */
  async revokeToken(token: string, reason?: string): Promise<void> {
    try {
      const payload = await this.jwtService.verifyAsync(token);

      // 计算令牌的原始过期时间
      const expiresAt = new Date(payload.exp * 1000);

      // 将令牌加入黑名单
      await this.prisma.tokenBlacklist.create({
        data: {
          jti: payload.jti,
          token,
          userId: payload.userId,
          reason,
          expiresAt,
        },
      });

      // 如果是刷新令牌，同时使其在数据库中失效
      if (payload.type === 'refresh') {
        await this.prisma.refreshToken.updateMany({
          where: {
            token,
            userId: payload.userId,
          },
          data: {
            isActive: false,
          },
        });
      }
    } catch (error) {
      // 即使令牌无效，也尝试将其加入黑名单
      await this.prisma.tokenBlacklist.create({
        data: {
          jti: randomUUID(),
          token,
          userId: 'unknown',
          reason,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7天后过期
        },
      });
    }
  }

  /**
   * 批量撤销用户的所有令牌
   */
  async revokeAllUserTokens(userId: string, reason?: string): Promise<void> {
    // 使所有刷新令牌失效
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    // 注意：访问令牌无法批量撤销，因为我们没有存储所有的访问令牌
    // 可以考虑维护一个用户级别的令牌版本号来实现批量撤销
  }

  /**
   * 检查令牌是否在黑名单中
   */
  private async isTokenBlacklisted(jti: string): Promise<boolean> {
    const blacklistedToken = await this.prisma.tokenBlacklist.findUnique({
      where: { jti },
    });

    return !!blacklistedToken;
  }

  /**
   * 清理过期的黑名单条目
   */
  async cleanupExpiredBlacklistEntries(): Promise<number> {
    const result = await this.prisma.tokenBlacklist.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    return result.count;
  }

  /**
   * 清理过期的刷新令牌
   */
  async cleanupExpiredRefreshTokens(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    return result.count;
  }

  /**
   * 提取令牌载荷（不验证）
   */
  extractPayload(token: string): any {
    try {
      return this.jwtService.decode(token);
    } catch {
      return null;
    }
  }

  /**
   * 获取用户的活跃会话数量
   */
  async getActiveSessionCount(userId: string): Promise<number> {
    return await this.prisma.refreshToken.count({
      where: {
        userId,
        isActive: true,
        expiresAt: {
          gt: new Date(),
        },
      },
    });
  }
}
