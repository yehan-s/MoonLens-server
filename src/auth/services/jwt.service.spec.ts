import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtTokenService } from './jwt.service';
import { PrismaService } from '../../prisma/prisma.service';

// Mock randomUUID
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn(() => 'mock-uuid'),
}));

describe('JwtTokenService', () => {
  let service: JwtTokenService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let prismaService: PrismaService;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    role: 'USER',
  };

  const mockRefreshToken = {
    id: 'refresh-token-id',
    userId: 'user-123',
    token: 'refresh-token-string',
    deviceId: 'device-123',
    isActive: true,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    user: mockUser,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtTokenService,
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn(),
            verifyAsync: jest.fn(),
            decode: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            refreshToken: {
              create: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              deleteMany: jest.fn(),
              count: jest.fn(),
            },
            tokenBlacklist: {
              create: jest.fn(),
              findUnique: jest.fn(),
              deleteMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<JwtTokenService>(JwtTokenService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('generateAccessToken', () => {
    it('应该生成访问令牌', async () => {
      const payload = {
        userId: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      };
      const expectedToken = 'access-token';
      const expiresIn = 3600;

      (configService.get as jest.Mock).mockReturnValue(expiresIn);
      (jwtService.signAsync as jest.Mock).mockResolvedValue(expectedToken);

      const result = await service.generateAccessToken(payload);

      expect(result).toEqual({
        token: expectedToken,
        expiresIn,
      });

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        {
          ...payload,
          jti: 'mock-uuid',
          type: 'access',
        },
        { expiresIn },
      );
    });
  });

  describe('generateRefreshToken', () => {
    it('应该生成刷新令牌并存储到数据库', async () => {
      const userId = 'user-123';
      const deviceId = 'device-123';
      const expectedToken = 'refresh-token';
      const expiresIn = 604800; // 7天

      (configService.get as jest.Mock).mockReturnValue(expiresIn);
      (jwtService.signAsync as jest.Mock).mockResolvedValue(expectedToken);
      (prismaService.refreshToken.create as jest.Mock).mockResolvedValue({});

      const result = await service.generateRefreshToken(userId, deviceId);

      expect(result).toEqual({
        token: expectedToken,
        expiresIn,
      });

      expect(prismaService.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId,
          token: expectedToken,
          deviceId,
          expiresAt: expect.any(Date),
        },
      });
    });

    it('应该生成刷新令牌（无设备ID）', async () => {
      const userId = 'user-123';
      const expectedToken = 'refresh-token';
      const expiresIn = 604800;

      (configService.get as jest.Mock).mockReturnValue(expiresIn);
      (jwtService.signAsync as jest.Mock).mockResolvedValue(expectedToken);
      (prismaService.refreshToken.create as jest.Mock).mockResolvedValue({});

      const result = await service.generateRefreshToken(userId);

      expect(result.token).toBe(expectedToken);
      expect(prismaService.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId,
          token: expectedToken,
          deviceId: undefined,
          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe('validateAccessToken', () => {
    it('应该验证有效的访问令牌', async () => {
      const token = 'valid-token';
      const payload = {
        userId: 'user-123',
        jti: 'token-id',
        type: 'access',
      };

      (jwtService.verifyAsync as jest.Mock).mockResolvedValue(payload);
      (prismaService.tokenBlacklist.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      const result = await service.validateAccessToken(token);

      expect(result).toEqual(payload);
      expect(jwtService.verifyAsync).toHaveBeenCalledWith(token);
    });

    it('应该拒绝黑名单中的令牌', async () => {
      const token = 'blacklisted-token';
      const payload = {
        userId: 'user-123',
        jti: 'token-id',
        type: 'access',
      };

      (jwtService.verifyAsync as jest.Mock).mockResolvedValue(payload);
      (prismaService.tokenBlacklist.findUnique as jest.Mock).mockResolvedValue({
        jti: 'token-id',
      });

      await expect(service.validateAccessToken(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('应该拒绝无效的令牌', async () => {
      const token = 'invalid-token';

      (jwtService.verifyAsync as jest.Mock).mockRejectedValue(
        new Error('Invalid token'),
      );

      await expect(service.validateAccessToken(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refreshAccessToken', () => {
    it('应该刷新访问令牌', async () => {
      const refreshToken = 'valid-refresh-token';
      const payload = {
        userId: 'user-123',
        jti: 'refresh-jti',
        type: 'refresh',
      };

      (jwtService.verifyAsync as jest.Mock).mockResolvedValue(payload);
      (prismaService.refreshToken.findFirst as jest.Mock).mockResolvedValue(
        mockRefreshToken,
      );
      (prismaService.refreshToken.update as jest.Mock).mockResolvedValue({});
      (configService.get as jest.Mock).mockReturnValue(3600);
      (jwtService.signAsync as jest.Mock).mockResolvedValue('new-access-token');

      const result = await service.refreshAccessToken(refreshToken);

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: undefined,
        expiresIn: 3600,
      });

      expect(prismaService.refreshToken.update).toHaveBeenCalledWith({
        where: { id: mockRefreshToken.id },
        data: { lastUsedAt: expect.any(Date) },
      });
    });

    it('应该在刷新令牌即将过期时生成新的刷新令牌', async () => {
      const refreshToken = 'expiring-refresh-token';
      const payload = {
        userId: 'user-123',
        jti: 'refresh-jti',
        type: 'refresh',
      };

      const expiringToken = {
        ...mockRefreshToken,
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12小时后过期
      };

      (jwtService.verifyAsync as jest.Mock).mockResolvedValue(payload);
      (prismaService.refreshToken.findFirst as jest.Mock).mockResolvedValue(
        expiringToken,
      );
      (prismaService.refreshToken.update as jest.Mock).mockResolvedValue({});
      (configService.get as jest.Mock)
        .mockReturnValueOnce(3600)
        .mockReturnValueOnce(604800);
      (jwtService.signAsync as jest.Mock)
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');

      const result = await service.refreshAccessToken(refreshToken);

      expect(result.refreshToken).toBe('new-refresh-token');
    });

    it('应该拒绝无效的刷新令牌', async () => {
      const refreshToken = 'invalid-refresh-token';

      (jwtService.verifyAsync as jest.Mock).mockRejectedValue(
        new Error('Invalid token'),
      );

      await expect(service.refreshAccessToken(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('应该拒绝类型错误的令牌', async () => {
      const refreshToken = 'wrong-type-token';
      const payload = {
        userId: 'user-123',
        jti: 'jti',
        type: 'access', // 错误的类型
      };

      (jwtService.verifyAsync as jest.Mock).mockResolvedValue(payload);

      await expect(service.refreshAccessToken(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('revokeToken', () => {
    it('应该撤销访问令牌', async () => {
      const token = 'access-token';
      const payload = {
        userId: 'user-123',
        jti: 'token-jti',
        type: 'access',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      (jwtService.verifyAsync as jest.Mock).mockResolvedValue(payload);
      (prismaService.tokenBlacklist.create as jest.Mock).mockResolvedValue({});

      await service.revokeToken(token, 'logout');

      expect(prismaService.tokenBlacklist.create).toHaveBeenCalledWith({
        data: {
          jti: payload.jti,
          token,
          userId: payload.userId,
          reason: 'logout',
          expiresAt: expect.any(Date),
        },
      });
    });

    it('应该撤销刷新令牌并使其失效', async () => {
      const token = 'refresh-token';
      const payload = {
        userId: 'user-123',
        jti: 'refresh-jti',
        type: 'refresh',
        exp: Math.floor(Date.now() / 1000) + 604800,
      };

      (jwtService.verifyAsync as jest.Mock).mockResolvedValue(payload);
      (prismaService.tokenBlacklist.create as jest.Mock).mockResolvedValue({});
      (prismaService.refreshToken.updateMany as jest.Mock).mockResolvedValue(
        {},
      );

      await service.revokeToken(token, 'logout');

      expect(prismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          token,
          userId: payload.userId,
        },
        data: {
          isActive: false,
        },
      });
    });

    it('应该处理无效令牌的撤销', async () => {
      const token = 'invalid-token';

      (jwtService.verifyAsync as jest.Mock).mockRejectedValue(
        new Error('Invalid'),
      );
      (prismaService.tokenBlacklist.create as jest.Mock).mockResolvedValue({});

      await service.revokeToken(token, 'security');

      expect(prismaService.tokenBlacklist.create).toHaveBeenCalledWith({
        data: {
          jti: 'mock-uuid',
          token,
          userId: 'unknown',
          reason: 'security',
          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe('revokeAllUserTokens', () => {
    it('应该撤销用户的所有刷新令牌', async () => {
      const userId = 'user-123';

      (prismaService.refreshToken.updateMany as jest.Mock).mockResolvedValue({
        count: 3,
      });

      await service.revokeAllUserTokens(userId, 'logout_all');

      expect(prismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          userId,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });
    });
  });

  describe('cleanupExpiredBlacklistEntries', () => {
    it('应该清理过期的黑名单条目', async () => {
      (prismaService.tokenBlacklist.deleteMany as jest.Mock).mockResolvedValue({
        count: 5,
      });

      const result = await service.cleanupExpiredBlacklistEntries();

      expect(result).toBe(5);
      expect(prismaService.tokenBlacklist.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: {
            lt: expect.any(Date),
          },
        },
      });
    });
  });

  describe('cleanupExpiredRefreshTokens', () => {
    it('应该清理过期的刷新令牌', async () => {
      (prismaService.refreshToken.deleteMany as jest.Mock).mockResolvedValue({
        count: 3,
      });

      const result = await service.cleanupExpiredRefreshTokens();

      expect(result).toBe(3);
      expect(prismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: {
            lt: expect.any(Date),
          },
        },
      });
    });
  });

  describe('extractPayload', () => {
    it('应该提取令牌载荷', () => {
      const token = 'some-token';
      const payload = { userId: 'user-123' };

      (jwtService.decode as jest.Mock).mockReturnValue(payload);

      const result = service.extractPayload(token);

      expect(result).toEqual(payload);
      expect(jwtService.decode).toHaveBeenCalledWith(token);
    });

    it('应该处理无效令牌', () => {
      const token = 'invalid-token';

      (jwtService.decode as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid');
      });

      const result = service.extractPayload(token);

      expect(result).toBeNull();
    });
  });

  describe('getActiveSessionCount', () => {
    it('应该返回活跃会话数量', async () => {
      const userId = 'user-123';

      (prismaService.refreshToken.count as jest.Mock).mockResolvedValue(5);

      const result = await service.getActiveSessionCount(userId);

      expect(result).toBe(5);
      expect(prismaService.refreshToken.count).toHaveBeenCalledWith({
        where: {
          userId,
          isActive: true,
          expiresAt: {
            gt: expect.any(Date),
          },
        },
      });
    });
  });
});
