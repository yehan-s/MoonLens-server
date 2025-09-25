import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ValidationPipe } from '@nestjs/common';

describe('认证系统 E2E 测试', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let refreshToken: string;

  // 测试用户数据
  const testUser = {
    email: 'e2e.test@example.com',
    username: 'e2etestuser',
    password: 'TestPass123',
    fullName: 'E2E Test User',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    // 添加全局验证管道
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      transform: true,
    }));
    
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // 清理测试数据
    await cleanupTestData();
  });

  afterAll(async () => {
    // 清理测试数据
    await cleanupTestData();
    await app.close();
  });

  async function cleanupTestData() {
    // 删除测试用户相关的所有数据
    try {
      await prisma.loginHistory.deleteMany({
        where: { user: { email: testUser.email } },
      });
      await prisma.refreshToken.deleteMany({
        where: { user: { email: testUser.email } },
      });
      await prisma.session.deleteMany({
        where: { user: { email: testUser.email } },
      });
      await prisma.user.deleteMany({
        where: { email: testUser.email },
      });
    } catch (error) {
      // 忽略清理错误
    }
  }

  describe('/auth/register (POST) - 用户注册', () => {
    it('应该成功注册新用户', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('user');
          expect(res.body.user.email).toBe(testUser.email);
          expect(res.body.user.username).toBe(testUser.username);
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body).toHaveProperty('refreshToken');
          expect(res.body).toHaveProperty('expiresIn');
          
          // 保存令牌用于后续测试
          accessToken = res.body.accessToken;
          refreshToken = res.body.refreshToken;
        });
    });

    it('应该拒绝重复的邮箱', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toContain('该邮箱已被注册');
        });
    });

    it('应该拒绝重复的用户名', () => {
      const newUser = {
        ...testUser,
        email: 'different@example.com',
        username: testUser.username,
      };

      return request(app.getHttpServer())
        .post('/auth/register')
        .send(newUser)
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toContain('该用户名已被使用');
        });
    });

    it('应该验证邮箱格式', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          ...testUser,
          email: 'invalid-email',
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('请输入有效的邮箱地址');
        });
    });

    it('应该验证密码强度', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          ...testUser,
          email: 'weak@example.com',
          password: 'weak', // 太短且缺少大写字母和数字
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('密码必须包含大写字母、小写字母和数字');
        });
    });

    it('应该验证用户名格式', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          ...testUser,
          email: 'test2@example.com',
          username: 'a', // 太短
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('用户名至少需要3个字符');
        });
    });
  });

  describe('/auth/login (POST) - 用户登录', () => {
    it('应该成功登录', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('user');
          expect(res.body.user.email).toBe(testUser.email);
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body).toHaveProperty('refreshToken');
          
          // 更新令牌
          accessToken = res.body.accessToken;
          refreshToken = res.body.refreshToken;
        });
    });

    it('应该拒绝错误的密码', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123',
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain('邮箱或密码错误');
        });
    });

    it('应该拒绝不存在的用户', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Password123',
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain('邮箱或密码错误');
        });
    });

    it('应该支持设备ID', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
          deviceId: 'test-device-123',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
        });
    });
  });

  describe('/auth/profile (GET) - 获取用户信息', () => {
    it('应该成功获取当前用户信息', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('userId');
          expect(res.body).toHaveProperty('email', testUser.email);
          expect(res.body).toHaveProperty('username', testUser.username);
          expect(res.body).toHaveProperty('role');
        });
    });

    it('应该拒绝未认证的请求', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .expect(401);
    });

    it('应该拒绝无效的令牌', () => {
      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('/auth/refresh (POST) - 刷新令牌', () => {
    it('应该成功刷新访问令牌', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh')
        .send({
          refreshToken: refreshToken,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body).toHaveProperty('expiresIn');
          
          // 更新访问令牌
          if (res.body.accessToken) {
            accessToken = res.body.accessToken;
          }
          // 如果返回了新的刷新令牌，也更新它
          if (res.body.refreshToken) {
            refreshToken = res.body.refreshToken;
          }
        });
    });

    it('应该拒绝无效的刷新令牌', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh')
        .send({
          refreshToken: 'invalid-refresh-token',
        })
        .expect(401);
    });

    it('应该验证刷新令牌格式', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh')
        .send({})
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('刷新令牌不能为空');
        });
    });
  });

  describe('/auth/login-history (GET) - 登录历史', () => {
    it('应该获取登录历史记录', () => {
      return request(app.getHttpServer())
        .get('/auth/login-history')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          // 应该至少有前面的登录记录
          expect(res.body.length).toBeGreaterThan(0);
          
          if (res.body.length > 0) {
            expect(res.body[0]).toHaveProperty('ipAddress');
            expect(res.body[0]).toHaveProperty('userAgent');
            expect(res.body[0]).toHaveProperty('success');
            expect(res.body[0]).toHaveProperty('createdAt');
          }
        });
    });

    it('应该拒绝未认证的请求', () => {
      return request(app.getHttpServer())
        .get('/auth/login-history')
        .expect(401);
    });
  });

  describe('/auth/sessions (GET) - 活跃会话', () => {
    it('应该获取活跃会话列表', () => {
      return request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  describe('/auth/logout (POST) - 用户登出', () => {
    it('应该成功登出', () => {
      return request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          refreshToken: refreshToken,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toContain('登出成功');
        });
    });

    it('应该拒绝使用已登出的令牌', async () => {
      // 等待一下确保令牌已被加入黑名单
      await new Promise(resolve => setTimeout(resolve, 100));

      return request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });
  });

  describe('/auth/logout-all (POST) - 登出所有设备', () => {
    let newAccessToken: string;

    beforeAll(async () => {
      // 先登录获取新的令牌
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });
      
      newAccessToken = loginResponse.body.accessToken;
    });

    it('应该成功登出所有设备', () => {
      return request(app.getHttpServer())
        .post('/auth/logout-all')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toContain('已从所有设备登出');
        });
    });
  });

  describe('输入验证测试', () => {
    it('应该拒绝空的注册数据', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({})
        .expect(400);
    });

    it('应该拒绝超长的用户名', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          ...testUser,
          email: 'long@example.com',
          username: 'a'.repeat(30), // 超过20个字符的限制
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('用户名不能超过20个字符');
        });
    });

    it('应该拒绝非法字符的用户名', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          ...testUser,
          email: 'special@example.com',
          username: 'user@#$%',
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('用户名只能包含字母、数字、下划线和横线');
        });
    });

    it('应该接受可选的全名字段', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'noname@example.com',
          username: 'nonameuser',
          password: 'ValidPass123',
          // 不提供 fullName
        })
        .expect(201);
    });
  });

  describe('安全性测试', () => {
    it('不应该在响应中返回密码', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'security@example.com',
          username: 'securityuser',
          password: 'SecurePass123',
        });

      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.user).not.toHaveProperty('salt');
    });

    it('应该在多次失败登录后锁定账户', async () => {
      // 创建一个新用户用于测试
      const lockTestUser = {
        email: 'locktest@example.com',
        username: 'locktestuser',
        password: 'LockTest123',
      };

      // 注册用户
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(lockTestUser);

      // 尝试5次错误登录
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: lockTestUser.email,
            password: 'WrongPassword',
          });
      }

      // 第6次应该被锁定，即使密码正确
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: lockTestUser.email,
          password: lockTestUser.password,
        })
        .expect(403)
        .expect((res) => {
          expect(res.body.message).toContain('账户已被锁定');
        });
    });
  });
});