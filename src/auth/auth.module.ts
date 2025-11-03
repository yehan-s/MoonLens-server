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
// import { GitlabOAuthStrategy } from './strategies/gitlab-oauth.strategy'; // 已改用自定义 OAuth 实现
import { GitLabOAuthController } from './gitlab-oauth.controller';
import { GitHubOAuthController } from './github-oauth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformTokenModule } from '../platform-tokens/platform-token.module';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { TOTPService } from './services/totp.service';

/**
 * 认证模块
 * 集成所有认证相关的服务、控制器和策略
 */
// 根据是否配置了 GitLab OAuth 客户端，按需注册策略，避免本地未配置时报错
// 已改用 GitLabOAuthController 的自定义 OAuth 实现，不再使用 Passport 策略
// const oauthProviders = (process.env.GITLAB_OAUTH_CLIENT_ID && process.env.GITLAB_OAUTH_CLIENT_SECRET)
//   ? [GitlabOAuthStrategy]
//   : [];
const oauthProviders = [];

@Module({
  imports: [
    PrismaModule,
    PlatformTokenModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        // 确保 expiresIn 是数字类型
        const expiresInValue = configService.get<string | number>('JWT_EXPIRES_IN', 3600);
        const expiresIn = typeof expiresInValue === 'string' ? parseInt(expiresInValue, 10) : expiresInValue;
        
        return {
          secret: configService.get<string>('JWT_SECRET', 'your-secret-key'),
          signOptions: {
            expiresIn,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, GitLabOAuthController, GitHubOAuthController],
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
