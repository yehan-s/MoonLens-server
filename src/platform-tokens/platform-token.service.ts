import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SaveTokenDto {
  userId: string;
  platform: 'gitlab' | 'github';
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  apiUrl?: string;
  authMethod?: 'oauth' | 'pat';
  platformUserId?: string;
  platformUsername?: string;
  platformEmail?: string;
}

@Injectable()
export class PlatformTokenService {
  constructor(private prisma: PrismaService) {}

  async saveToken(data: SaveTokenDto) {
    return this.prisma.platformToken.upsert({
      where: {
        userId_platform: {
          userId: data.userId,
          platform: data.platform,
        },
      },
      update: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        apiUrl: data.apiUrl,
        authMethod: data.authMethod || 'oauth',
        platformUserId: data.platformUserId,
        platformUsername: data.platformUsername,
        platformEmail: data.platformEmail,
      },
      create: {
        userId: data.userId,
        platform: data.platform,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        apiUrl: data.apiUrl || (data.platform === 'gitlab' ? 'https://gitlab.com' : 'https://api.github.com'),
        authMethod: data.authMethod || 'oauth',
        platformUserId: data.platformUserId,
        platformUsername: data.platformUsername,
        platformEmail: data.platformEmail,
      },
    });
  }

  async getToken(userId: string, platform: 'gitlab' | 'github') {
    return this.prisma.platformToken.findUnique({
      where: {
        userId_platform: { userId, platform },
      },
    });
  }

  async deleteToken(userId: string, platform: 'gitlab' | 'github') {
    return this.prisma.platformToken.delete({
      where: {
        userId_platform: { userId, platform },
      },
    });
  }

  async isTokenExpired(token: { expiresAt?: Date }): Promise<boolean> {
    if (!token.expiresAt) return false;
    return new Date() >= token.expiresAt;
  }
}
