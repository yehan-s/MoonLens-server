import { Controller, Get, Query, Res, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformTokenService } from '../platform-tokens/platform-token.service';
import axios from 'axios';

@Controller('auth/github')
export class GitHubOAuthController {
  private readonly logger = new Logger(GitHubOAuthController.name);

  constructor(
    private configService: ConfigService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private platformTokenService: PlatformTokenService,
  ) {}

  @Get('login')
  login(@Res() res: Response) {
    const clientId = this.configService.get('GITHUB_CLIENT_ID');
    const redirectUri = this.configService.get('GITHUB_REDIRECT_URI');

    if (!clientId || !redirectUri) {
      throw new HttpException(
        'GitHub OAuth 配置缺失',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const githubBaseUrl = this.configService.get('GITHUB_BASE_URL') || 'https://github.com';
    const authUrl = new URL(`${githubBaseUrl}/login/oauth/authorize`);
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('scope', 'read:user user:email repo');

    this.logger.log(`Redirecting to GitHub OAuth: ${authUrl.toString()}`);
    res.redirect(authUrl.toString());
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get('FRONTEND_URL');

    try {
      if (!code) {
        throw new Error('未收到授权码');
      }

      this.logger.log('Processing GitHub OAuth callback');

      const tokenResponse = await this.exchangeCodeForToken(code);
      const { access_token } = tokenResponse;

      const githubUser = await this.getGitHubUser(access_token);
      const userEmails = await this.getGitHubUserEmails(access_token);
      const primaryEmail = userEmails.find((email: any) => email.primary)?.email || githubUser.email;

      if (!primaryEmail) {
        throw new Error('GitHub 账号未设置公开邮箱');
      }

      this.logger.log(`GitHub user authenticated: ${githubUser.login}`);

      let user = await this.prisma.user.findUnique({
        where: { email: primaryEmail },
      });

      if (!user) {
        user = await this.prisma.user.create({
          data: {
            email: primaryEmail,
            username: githubUser.login,
            fullName: githubUser.name,
            avatar: githubUser.avatar_url,
            role: 'USER',
            password: '',
            emailVerified: true,
          },
        });
        this.logger.log(`Created new user: ${user.username}`);
      }

      await this.platformTokenService.saveToken({
        userId: user.id,
        platform: 'github',
        accessToken: access_token,
        authMethod: 'oauth',
        platformUserId: String(githubUser.id),
        platformUsername: githubUser.login,
        platformEmail: primaryEmail,
        apiUrl: this.configService.get('GITHUB_API_URL') || 'https://api.github.com',
      });
      this.logger.log(`Saved GitHub token for user: ${user.username}`);

      // 使用正确的JWT格式，包含必需的字段
      const jti = require('crypto').randomUUID();
      const moonlensJWT = this.jwtService.sign({
        userId: user.id,
        email: user.email,
        role: user.role,
        jti,
        type: 'access',
      }, {
        expiresIn: '1h',
      });

      // 生成 refresh token
      const refreshJti = require('crypto').randomUUID();
      const refreshToken = this.jwtService.sign({
        userId: user.id,
        jti: refreshJti,
        type: 'refresh',
      }, {
        expiresIn: '7d',
      });

      // 将refresh token存储到数据库
      const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          token: refreshToken,
          expiresAt: refreshExpiresAt,
        },
      });

      const callbackUrl = new URL('/auth/callback', frontendUrl);
      callbackUrl.searchParams.append('token', moonlensJWT);
      callbackUrl.searchParams.append('refreshToken', refreshToken);
      callbackUrl.searchParams.append('platform', 'github');
      callbackUrl.searchParams.append('authenticated', 'true');
      callbackUrl.searchParams.append('githubToken', access_token); // 返回 GitHub OAuth token

      this.logger.log('Redirecting to frontend with token');
      res.redirect(callbackUrl.toString());
    } catch (error) {
      this.logger.error('GitHub OAuth callback failed:', error);

      const errorUrl = new URL('/login', frontendUrl);
      errorUrl.searchParams.append('error', 'github_oauth_failed');
      errorUrl.searchParams.append('message', error.message || '未知错误');

      res.redirect(errorUrl.toString());
    }
  }

  private async exchangeCodeForToken(code: string) {
    const clientId = this.configService.get('GITHUB_CLIENT_ID');
    const clientSecret = this.configService.get('GITHUB_CLIENT_SECRET');
    const redirectUri = this.configService.get('GITHUB_REDIRECT_URI');

    const response = await axios.post(
      `${this.configService.get('GITHUB_BASE_URL') || 'https://github.com'}/login/oauth/access_token`,
      {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      },
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );

    if (response.data.error) {
      throw new Error(`GitHub OAuth 错误: ${response.data.error_description}`);
    }

    return response.data;
  }

  private async getGitHubUser(accessToken: string) {
    const apiUrl = this.configService.get('GITHUB_API_URL') || 'https://api.github.com';
    const response = await axios.get(`${apiUrl}/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    });

    return response.data;
  }

  private async getGitHubUserEmails(accessToken: string) {
    const apiUrl = this.configService.get('GITHUB_API_URL') || 'https://api.github.com';
    const response = await axios.get(`${apiUrl}/user/emails`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    });

    return response.data;
  }
}
