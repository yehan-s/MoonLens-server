import { Controller, Get, Query, Res, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformTokenService } from '../platform-tokens/platform-token.service';
import { AuthService } from './auth.service';
import axios from 'axios';

@Controller('auth/gitlab')
export class GitLabOAuthController {
  private readonly logger = new Logger(GitLabOAuthController.name);

  constructor(
    private configService: ConfigService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private platformTokenService: PlatformTokenService,
    private authService: AuthService,
  ) {}

  /**
   * 第一步：重定向到 GitLab 授权页面
   */
  @Get('login')
  login(@Query('gitlabUrl') gitlabUrl: string, @Res() res: Response) {
    const clientId = this.configService.get('GITLAB_CLIENT_ID');
    const redirectUri = this.configService.get('GITLAB_REDIRECT_URI');
    
    // 支持自部署 GitLab：从查询参数获取 URL，否则使用环境变量，默认 gitlab.com
    const baseUrl = gitlabUrl || this.configService.get('GITLAB_BASE_URL');

    if (!clientId || !redirectUri) {
      throw new HttpException(
        'GitLab OAuth 配置缺失，请检查环境变量',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // 将 GitLab URL 存储到 session/cookie，以便回调时使用
    // 这里简化处理：通过 state 参数传递（需要编码）
    const state = Buffer.from(JSON.stringify({ gitlabUrl: baseUrl })).toString('base64');

    const authUrl = new URL(`${baseUrl}/oauth/authorize`);
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'api read_user read_repository');
    authUrl.searchParams.append('state', state);

    this.logger.log(`Redirecting to GitLab OAuth: ${authUrl.toString()}`);
    res.redirect(authUrl.toString());
  }

  /**
   * 第二步：处理 GitLab 回调
   */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:5173';

    try {
      if (!code) {
        throw new Error('未收到授权码');
      }

      // 从 state 参数中恢复 GitLab URL
      let gitlabUrl = this.configService.get('GITLAB_BASE_URL');
      if (state) {
        try {
          const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
          gitlabUrl = decoded.gitlabUrl || gitlabUrl;
        } catch (e) {
          this.logger.warn('Failed to decode state parameter:', e.message);
        }
      }

      this.logger.log(`Processing GitLab OAuth callback for ${gitlabUrl}`);

      // 1. 用 code 换取 access_token
      const tokenResponse = await this.exchangeCodeForToken(code, gitlabUrl);
      const { access_token, refresh_token, expires_in } = tokenResponse;

      // 2. 用 access_token 获取 GitLab 用户信息
      const gitlabUser = await this.getGitLabUser(access_token, gitlabUrl);
      this.logger.log(`GitLab user authenticated: ${gitlabUser.username}`);

      // 3. 在 MoonLens 数据库中查找或创建用户
      let user = await this.prisma.user.findUnique({
        where: { email: gitlabUser.email },
      });

      if (!user) {
        user = await this.prisma.user.create({
          data: {
            email: gitlabUser.email,
            username: gitlabUser.username,
            fullName: gitlabUser.name,
            avatar: gitlabUser.avatar_url,
            role: 'USER',
            password: '', // OAuth 用户无密码
            emailVerified: true,
          },
        });
        this.logger.log(`Created new user: ${user.username}`);
      }

      // 4. 保存 GitLab access_token 到数据库（包含 apiUrl）
      await this.platformTokenService.saveToken({
        userId: user.id,
        platform: 'gitlab',
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : undefined,
        apiUrl: gitlabUrl, // 保存自部署 GitLab 地址
        authMethod: 'oauth',
        platformUserId: String(gitlabUser.id),
        platformUsername: gitlabUser.username,
        platformEmail: gitlabUser.email,
      });
      this.logger.log(`Saved GitLab token for user: ${user.username}, URL: ${gitlabUrl}`);

      // 5. 生成 MoonLens JWT (使用 AuthService 生成包含 refreshToken 的完整 tokens)
      const tokens = await this.authService.issueTokensForUser(user.id);

      // 6. 重定向到前端
      const callbackUrl = new URL('/auth/callback', frontendUrl);
      callbackUrl.searchParams.append('token', tokens.accessToken);
      callbackUrl.searchParams.append('refreshToken', tokens.refreshToken);
      callbackUrl.searchParams.append('platform', 'gitlab');
      callbackUrl.searchParams.append('authenticated', 'true');
      callbackUrl.searchParams.append('gitlabToken', access_token); // 返回 GitLab OAuth token

      this.logger.log('Redirecting to frontend with token');
      res.redirect(callbackUrl.toString());
    } catch (error) {
      this.logger.error('GitLab OAuth callback failed:', error);

      const errorUrl = new URL('/login', frontendUrl);
      errorUrl.searchParams.append('error', 'gitlab_oauth_failed');
      errorUrl.searchParams.append('message', error.message || '未知错误');

      res.redirect(errorUrl.toString());
    }
  }

  /**
   * 用 code 换取 access_token
   */
  private async exchangeCodeForToken(code: string, gitlabUrl: string) {
    const clientId = this.configService.get('GITLAB_CLIENT_ID');
    const clientSecret = this.configService.get('GITLAB_CLIENT_SECRET');
    const redirectUri = this.configService.get('GITLAB_REDIRECT_URI');

    const response = await axios.post(`${gitlabUrl}/oauth/token`, {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    return response.data;
  }

  /**
   * 获取 GitLab 用户信息
   */
  private async getGitLabUser(accessToken: string, gitlabUrl: string) {
    const response = await axios.get(`${gitlabUrl}/api/v4/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.data;
  }
}
