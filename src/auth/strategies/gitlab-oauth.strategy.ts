import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy as GitLabStrategy, Profile } from 'passport-gitlab2';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GitlabOAuthStrategy extends PassportStrategy(GitLabStrategy, 'gitlab') {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      clientID: config.get<string>('GITLAB_OAUTH_CLIENT_ID'),
      clientSecret: config.get<string>('GITLAB_OAUTH_CLIENT_SECRET'),
      callbackURL: config.get<string>('GITLAB_OAUTH_CALLBACK_URL') || 'http://localhost:3000/api/auth/gitlab/callback',
      baseURL: config.get<string>('GITLAB_BASE_URL') || 'https://gitlab.com',
      scope: ['read_user', 'read_api'],
      // 开启 OAuth2 state 参数，防止 CSRF 攻击
      state: true,
    });
  }

  // GitLab OAuth 成功后的回调
  async validate(_accessToken: string, _refreshToken: string, profile: Profile, done: Function) {
    try {
      const gitlabId = String(profile.id);
      const email = profile.emails && profile.emails[0] ? profile.emails[0].value : undefined;
      const username = profile.username || profile.displayName || (email ? email.split('@')[0] : `gl_${gitlabId}`);

      let user = await this.prisma.user.findFirst({ where: { gitlabUserId: gitlabId } });
      if (!user && email) {
        user = await this.prisma.user.findUnique({ where: { email } });
      }

      if (!user) {
        user = await this.prisma.user.create({
          data: {
            email: email || `${gitlabId}@example.invalid`,
            username,
            password: '!', // 占位，OAuth 账户不用于本地密码登录
            gitlabUserId: gitlabId,
            fullName: profile.displayName || undefined,
            emailVerified: !!email,
          },
        });
      } else if (!user.gitlabUserId) {
        await this.prisma.user.update({ where: { id: user.id }, data: { gitlabUserId: gitlabId } });
      }

      return done(null, user);
    } catch (e) {
      return done(e, null);
    }
  }
}
