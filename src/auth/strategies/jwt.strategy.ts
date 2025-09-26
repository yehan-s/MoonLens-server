import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtTokenService } from '../services/jwt.service';

/**
 * JWT 策略
 * 用于验证和解析 JWT Token
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwtTokenService: JwtTokenService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'your-secret-key'),
    });
  }

  /**
   * 验证 JWT 载荷
   */
  async validate(payload: any) {
    // 检查令牌类型
    if (payload.type !== 'access') {
      throw new UnauthorizedException('无效的令牌类型');
    }

    // 黑名单检查
    const blacklisted = await this.prisma.tokenBlacklist.findUnique({
      where: { jti: payload.jti },
    });
    if (blacklisted) {
      throw new UnauthorizedException('Token 已被撤销');
    }

    // 获取用户信息
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        isLocked: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('用户账户已被禁用');
    }

    if (user.isLocked) {
      throw new UnauthorizedException('用户账户已被锁定');
    }

    // 返回用户信息（将被注入到请求对象中）
    return {
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    };
  }
}
