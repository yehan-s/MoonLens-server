import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './services/password.service';
import { JwtTokenService } from './services/jwt.service';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GitlabOAuthStrategy } from './strategies/gitlab-oauth.strategy';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { TOTPService } from './services/totp.service';

/**
 * 认证模块
 * 集成所有认证相关的服务、控制器和策略
 */
// 根据是否配置了 GitLab OAuth 客户端，按需注册策略，避免本地未配置时报错
const oauthProviders = (process.env.GITLAB_OAUTH_CLIENT_ID && process.env.GITLAB_OAUTH_CLIENT_SECRET)
  ? [GitlabOAuthStrategy]
  : [];

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'your-secret-key'),
        signOptions: {
          expiresIn: configService.get<number>('JWT_EXPIRES_IN', 3600),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    JwtTokenService,
    LocalStrategy,
    JwtStrategy,
    // 注册 GitLab OAuth 策略（仅在配置存在时）
    ...oauthProviders,
    RolesGuard,
    PermissionsGuard,
    TOTPService,
  ],
  exports: [
    AuthService,
    PasswordService,
    JwtTokenService,
    RolesGuard,
    PermissionsGuard,
    TOTPService,
  ],
})
export class AuthModule {}
