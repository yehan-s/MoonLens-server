import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * 种子数据生成脚本
 * 创建默认管理员账户和测试数据
 */
async function main() {
  console.log('🌱 开始数据库种子数据初始化...');

  try {

  // 创建默认管理员账户
  const adminPassword = await bcrypt.hash('Admin@123456', 10);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@moonlens.com' },
    update: {},
    create: {
      email: 'admin@moonlens.com',
      username: 'admin',
      password: adminPassword,
      fullName: 'System Administrator',
      role: UserRole.ADMIN,
      isActive: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      preferences: {
        theme: 'dark',
        language: 'zh-CN',
        notifications: {
          email: true,
          inApp: true
        }
      }
    }
  });
  console.log(`✅ 创建管理员账户: ${adminUser.email}`);

  // 创建测试用户账户
  const testPassword = await bcrypt.hash('Test@123456', 10);
  const testUser = await prisma.user.upsert({
    where: { email: 'test@moonlens.com' },
    update: {},
    create: {
      email: 'test@moonlens.com',
      username: 'testuser',
      password: testPassword,
      fullName: 'Test User',
      role: UserRole.USER,
      isActive: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      preferences: {
        theme: 'light',
        language: 'zh-CN',
        notifications: {
          email: true,
          inApp: false
        }
      }
    }
  });
  console.log(`✅ 创建测试用户: ${testUser.email}`);

  // 创建默认 AI 配置
  const openaiConfig = await prisma.aIConfig.upsert({
    where: { name: 'OpenAI GPT-4' },
    update: {},
    create: {
      name: 'OpenAI GPT-4',
      provider: 'openai',
      modelName: 'gpt-4',
      apiEndpoint: 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY || 'sk-your-api-key-here',
      config: {
        temperature: 0.7,
        maxTokens: 4000,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0
      },
      isDefault: true,
      isActive: true
    }
  });
  console.log(`✅ 创建 OpenAI 配置: ${openaiConfig.name}`);

  const claudeConfig = await prisma.aIConfig.upsert({
    where: { name: 'Anthropic Claude' },
    update: {},
    create: {
      name: 'Anthropic Claude',
      provider: 'anthropic',
      modelName: 'claude-3-opus-20240229',
      apiEndpoint: 'https://api.anthropic.com/v1',
      apiKey: process.env.ANTHROPIC_API_KEY || 'sk-ant-your-api-key-here',
      config: {
        temperature: 0.7,
        maxTokens: 4000,
        topP: 1
      },
      isDefault: false,
      isActive: true
    }
  });
  console.log(`✅ 创建 Claude 配置: ${claudeConfig.name}`);

  // 创建默认审查规则
  const securityRules = [
    {
      name: 'SQL 注入检测',
      description: '检测可能的 SQL 注入漏洞',
      category: 'security',
      severity: 'critical',
      pattern: '(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER).*\\$\\{.*\\}',
      config: { enabled: true }
    },
    {
      name: 'XSS 漏洞检测',
      description: '检测潜在的跨站脚本攻击漏洞',
      category: 'security',
      severity: 'critical',
      pattern: 'innerHTML|dangerouslySetInnerHTML|eval\\(',
      config: { enabled: true }
    },
    {
      name: '硬编码密钥检测',
      description: '检测硬编码的 API 密钥或密码',
      category: 'security',
      severity: 'major',
      pattern: '(api[_-]?key|password|secret|token)\\s*=\\s*["\'].*["\']',
      config: { enabled: true }
    }
  ];

  for (const rule of securityRules) {
    const existing = await prisma.reviewRule.findFirst({
      where: {
        name: rule.name,
        category: rule.category
      }
    });

    if (!existing) {
      await prisma.reviewRule.create({
        data: rule
      });
      console.log(`✅ 创建审查规则: ${rule.name}`);
    }
  }

  // 创建性能相关规则
  const performanceRules = [
    {
      name: 'N+1 查询检测',
      description: '检测可能的 N+1 查询问题',
      category: 'performance',
      severity: 'major',
      pattern: 'for.*\\.(find|findOne|query)\\(',
      config: { enabled: true }
    },
    {
      name: '大文件导入检测',
      description: '检测可能影响性能的大文件导入',
      category: 'performance',
      severity: 'minor',
      pattern: 'import.*from.*\\.(jpg|png|gif|svg|mp4|mov)',
      config: { enabled: true }
    }
  ];

  for (const rule of performanceRules) {
    const existing = await prisma.reviewRule.findFirst({
      where: {
        name: rule.name,
        category: rule.category
      }
    });

    if (!existing) {
      await prisma.reviewRule.create({
        data: rule
      });
      console.log(`✅ 创建审查规则: ${rule.name}`);
    }
  }

  // 创建测试项目（如果需要）
  if (process.env.CREATE_TEST_DATA === 'true') {
    const testProject = await prisma.project.create({
      data: {
        name: 'Test Project',
        description: '用于测试的示例项目',
        gitlabProjectId: '12345',
        gitlabProjectUrl: 'https://gitlab.com/test/project',
        defaultBranch: 'main',
        ownerId: testUser.id,
        reviewConfig: {
          autoReview: true,
          reviewOnPush: true,
          reviewOnMergeRequest: true,
          aiModel: 'OpenAI GPT-4',
          customPrompt: null
        }
      }
    });
    console.log(`✅ 创建测试项目: ${testProject.name}`);
  }

  console.log('✨ 种子数据初始化完成！');
  console.log('');
  console.log('📝 默认账户信息：');
  console.log('管理员账户: admin@moonlens.com / Admin@123456');
  console.log('测试账户: test@moonlens.com / Test@123456');
  
  } catch (error) {
    console.error('❌ 种子数据初始化失败：', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('❌ 种子数据初始化失败：', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });