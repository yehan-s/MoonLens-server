import { Test, TestingModule } from '@nestjs/testing';
import { 
  ConflictException, 
  UnauthorizedException, 
  BadRequestException,
  ForbiddenException 
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './services/password.service';
import { JwtTokenService } from './services/jwt.service';
import { UserRole } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: PrismaService;
  let passwordService: PasswordService;
  let jwtTokenService: JwtTokenService;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    password: 'hashedPassword',
    fullName: 'Test User',
    role: UserRole.USER,
    isActive: true,
    isLocked: false,
    loginAttempts: 0,
    lockedUntil: null,
    avatar: null,
    lastLoginAt: null,
    lastLoginIp: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            loginHistory: {
              create: jest.fn(),
              findMany: jest.fn(),
            },
            session: {
              findMany: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: PasswordService,
          useValue: {
            validatePasswordStrength: jest.fn(),
            hashPassword: jest.fn(),
            verifyPassword: jest.fn(),
          },
        },
        {
          provide: JwtTokenService,
          useValue: {
            generateAccessToken: jest.fn(),
            generateRefreshToken: jest.fn(),
            refreshAccessToken: jest.fn(),
            revokeToken: jest.fn(),
            revokeAllUserTokens: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    passwordService = module.get<PasswordService>(PasswordService);
    jwtTokenService = module.get<JwtTokenService>(JwtTokenService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('用户注册', () => {
    const registerDto = {
      email: 'new@example.com',
      username: 'newuser',
      password: 'ValidPass123',
      fullName: 'New User',
    };

    it('应该成功注册新用户', async () => {
      (prismaService.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(null) // Email check
        .mockResolvedValueOnce(null); // Username check
      
      (passwordService.validatePasswordStrength as jest.Mock).mockReturnValue({
        isValid: true,
        errors: [],
      });
      
      (passwordService.hashPassword as jest.Mock).mockResolvedValue('hashedPassword');
      
      (prismaService.user.create as jest.Mock).mockResolvedValue({
        ...mockUser,
        email: registerDto.email,
        username: registerDto.username,
      });
      
      (jwtTokenService.generateAccessToken as jest.Mock).mockResolvedValue({
        token: 'access-token',
        expiresIn: 3600,
      });
      
      (jwtTokenService.generateRefreshToken as jest.Mock).mockResolvedValue({
        token: 'refresh-token',
        expiresIn: 604800,
      });

      const result = await service.register(registerDto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken', 'access-token');
      expect(result).toHaveProperty('refreshToken', 'refresh-token');
      expect(passwordService.hashPassword).toHaveBeenCalledWith(registerDto.password);
    });

    it('应该拒绝已存在的邮箱', async () => {
      (prismaService.user.findUnique as jest.Mock).mockResolvedValueOnce(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(
        new ConflictException('该邮箱已被注册'),
      );
    });

    it('应该拒绝已存在的用户名', async () => {
      (prismaService.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(null) // Email check
        .mockResolvedValueOnce(mockUser); // Username check

      await expect(service.register(registerDto)).rejects.toThrow(
        new ConflictException('该用户名已被使用'),
      );
    });

    it('应该拒绝弱密码', async () => {
      (prismaService.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      
      (passwordService.validatePasswordStrength as jest.Mock).mockReturnValue({
        isValid: false,
        errors: ['密码太弱'],
      });

      await expect(service.register(registerDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('用户登录', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'ValidPass123',
      deviceId: 'device-123',
    };

    it('应该成功登录', async () => {
      jest.spyOn(service, 'validateUser').mockResolvedValue(mockUser as any);
      
      (prismaService.loginHistory.create as jest.Mock).mockResolvedValue({});
      (prismaService.user.update as jest.Mock).mockResolvedValue(mockUser);
      
      (jwtTokenService.generateAccessToken as jest.Mock).mockResolvedValue({
        token: 'access-token',
        expiresIn: 3600,
      });
      
      (jwtTokenService.generateRefreshToken as jest.Mock).mockResolvedValue({
        token: 'refresh-token',
        expiresIn: 604800,
      });

      const result = await service.login(loginDto, '127.0.0.1', 'UserAgent');

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken', 'access-token');
      expect(result).toHaveProperty('refreshToken', 'refresh-token');
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          lastLoginAt: expect.any(Date),
          lastLoginIp: '127.0.0.1',
          loginAttempts: 0,
        },
      });
    });

    it('应该记录失败的登录尝试', async () => {
      jest.spyOn(service, 'validateUser').mockResolvedValue(null);
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prismaService.loginHistory.create as jest.Mock).mockResolvedValue({});

      await expect(service.login(loginDto, '127.0.0.1', 'UserAgent')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(prismaService.loginHistory.create).toHaveBeenCalledWith({
        data: {
          userId: mockUser.id,
          ipAddress: '127.0.0.1',
          userAgent: 'UserAgent',
          success: false,
          failReason: '邮箱或密码错误',
        },
      });
    });

    it('应该处理被锁定的账户', async () => {
      const lockedUser = {
        ...mockUser,
        isLocked: true,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000), // 10分钟后
      };

      jest.spyOn(service, 'validateUser').mockResolvedValue(lockedUser as any);

      await expect(service.login(loginDto, '127.0.0.1', 'UserAgent')).rejects.toThrow(
        new ForbiddenException('账户已被锁定，请稍后再试'),
      );
    });

    it('应该自动解锁过期的锁定', async () => {
      const expiredLockUser = {
        ...mockUser,
        isLocked: true,
        lockedUntil: new Date(Date.now() - 1000), // 已过期
      };

      jest.spyOn(service, 'validateUser').mockResolvedValue(expiredLockUser as any);
      (prismaService.user.update as jest.Mock).mockResolvedValue(mockUser);
      (prismaService.loginHistory.create as jest.Mock).mockResolvedValue({});
      (jwtTokenService.generateAccessToken as jest.Mock).mockResolvedValue({
        token: 'access-token',
        expiresIn: 3600,
      });
      (jwtTokenService.generateRefreshToken as jest.Mock).mockResolvedValue({
        token: 'refresh-token',
        expiresIn: 604800,
      });

      const result = await service.login(loginDto, '127.0.0.1', 'UserAgent');

      expect(result).toHaveProperty('accessToken');
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: expiredLockUser.id },
        data: {
          isLocked: false,
          lockedUntil: null,
          loginAttempts: 0,
        },
      });
    });
  });

  describe('验证用户', () => {
    it('应该验证有效的凭据', async () => {
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (passwordService.verifyPassword as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('test@example.com', 'ValidPass123');

      expect(result).toEqual(mockUser);
    });

    it('应该拒绝不存在的用户', async () => {
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.validateUser('nonexistent@example.com', 'password');

      expect(result).toBeNull();
    });

    it('应该拒绝错误的密码', async () => {
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (passwordService.verifyPassword as jest.Mock).mockResolvedValue(false);
      (prismaService.user.update as jest.Mock).mockResolvedValue({});

      const result = await service.validateUser('test@example.com', 'WrongPassword');

      expect(result).toBeNull();
      expect(prismaService.user.update).toHaveBeenCalled();
    });

    it('应该在5次失败后锁定账户', async () => {
      const userWith4Attempts = {
        ...mockUser,
        loginAttempts: 4,
      };

      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(userWith4Attempts);
      (passwordService.verifyPassword as jest.Mock).mockResolvedValue(false);
      (prismaService.user.update as jest.Mock).mockResolvedValue({});

      await service.validateUser('test@example.com', 'WrongPassword');

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: userWith4Attempts.id },
        data: {
          loginAttempts: 5,
          isLocked: true,
          lockedUntil: expect.any(Date),
        },
      });
    });

    it('应该拒绝被禁用的账户', async () => {
      const inactiveUser = {
        ...mockUser,
        isActive: false,
      };

      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(inactiveUser);
      (passwordService.verifyPassword as jest.Mock).mockResolvedValue(true);

      await expect(
        service.validateUser('test@example.com', 'ValidPass123'),
      ).rejects.toThrow(new ForbiddenException('用户账户已被禁用'));
    });
  });

  describe('刷新令牌', () => {
    it('应该成功刷新访问令牌', async () => {
      const refreshTokenDto = { refreshToken: 'valid-refresh-token' };
      const expectedResult = {
        accessToken: 'new-access-token',
        refreshToken: undefined,
        expiresIn: 3600,
      };

      (jwtTokenService.refreshAccessToken as jest.Mock).mockResolvedValue(expectedResult);

      const result = await service.refreshToken(refreshTokenDto);

      expect(result).toEqual(expectedResult);
      expect(jwtTokenService.refreshAccessToken).toHaveBeenCalledWith(
        refreshTokenDto.refreshToken,
      );
    });
  });

  describe('登出', () => {
    it('应该撤销访问令牌', async () => {
      const accessToken = 'access-token';
      
      (jwtTokenService.revokeToken as jest.Mock).mockResolvedValue(undefined);

      const result = await service.logout(accessToken);

      expect(result).toEqual({ message: '登出成功' });
      expect(jwtTokenService.revokeToken).toHaveBeenCalledWith(accessToken, 'logout');
    });

    it('应该撤销访问和刷新令牌', async () => {
      const accessToken = 'access-token';
      const refreshToken = 'refresh-token';
      
      (jwtTokenService.revokeToken as jest.Mock).mockResolvedValue(undefined);

      const result = await service.logout(accessToken, refreshToken);

      expect(result).toEqual({ message: '登出成功' });
      expect(jwtTokenService.revokeToken).toHaveBeenCalledTimes(2);
      expect(jwtTokenService.revokeToken).toHaveBeenCalledWith(accessToken, 'logout');
      expect(jwtTokenService.revokeToken).toHaveBeenCalledWith(refreshToken, 'logout');
    });
  });

  describe('登出所有设备', () => {
    it('应该撤销用户的所有令牌', async () => {
      const userId = 'user-123';
      
      (jwtTokenService.revokeAllUserTokens as jest.Mock).mockResolvedValue(undefined);

      const result = await service.logoutAllDevices(userId);

      expect(result).toEqual({ message: '已从所有设备登出' });
      expect(jwtTokenService.revokeAllUserTokens).toHaveBeenCalledWith(userId, 'logout_all');
    });
  });

  describe('登录历史', () => {
    it('应该获取用户登录历史', async () => {
      const userId = 'user-123';
      const mockHistory = [
        {
          id: 'history-1',
          ipAddress: '127.0.0.1',
          userAgent: 'Chrome',
          success: true,
          createdAt: new Date(),
        },
      ];

      (prismaService.loginHistory.findMany as jest.Mock).mockResolvedValue(mockHistory);

      const result = await service.getLoginHistory(userId);

      expect(result).toEqual(mockHistory);
      expect(prismaService.loginHistory.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: expect.any(Object),
      });
    });

    it('应该支持自定义限制数量', async () => {
      const userId = 'user-123';
      const limit = 20;

      (prismaService.loginHistory.findMany as jest.Mock).mockResolvedValue([]);

      await service.getLoginHistory(userId, limit);

      expect(prismaService.loginHistory.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: expect.any(Object),
      });
    });
  });

  describe('会话管理', () => {
    it('应该获取活跃会话', async () => {
      const userId = 'user-123';
      const mockSessions = [
        {
          id: 'session-1',
          sessionId: 'sid-1',
          deviceName: 'Chrome on MacOS',
          ipAddress: '127.0.0.1',
          lastActivity: new Date(),
        },
      ];

      (prismaService.session.findMany as jest.Mock).mockResolvedValue(mockSessions);

      const result = await service.getActiveSessions(userId);

      expect(result).toEqual(mockSessions);
      expect(prismaService.session.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          isActive: true,
          expiresAt: {
            gt: expect.any(Date),
          },
        },
        orderBy: { lastActivity: 'desc' },
        select: expect.any(Object),
      });
    });

    it('应该终止指定会话', async () => {
      const userId = 'user-123';
      const sessionId = 'session-1';
      const mockSession = {
        id: sessionId,
        userId,
        isActive: true,
      };

      (prismaService.session.findFirst as jest.Mock).mockResolvedValue(mockSession);
      (prismaService.session.update as jest.Mock).mockResolvedValue({});

      const result = await service.terminateSession(userId, sessionId);

      expect(result).toEqual({ message: '会话已终止' });
      expect(prismaService.session.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: { isActive: false },
      });
    });

    it('应该拒绝终止不存在的会话', async () => {
      const userId = 'user-123';
      const sessionId = 'non-existent';

      (prismaService.session.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.terminateSession(userId, sessionId)).rejects.toThrow(
        new BadRequestException('会话不存在'),
      );
    });
  });
});