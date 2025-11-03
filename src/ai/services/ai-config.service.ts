import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface AIProviderConfig {
  provider: string;
  apiKey: string;
  apiUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  enabled?: boolean;
}

export interface AISettings {
  userId: string;
  providers: AIProviderConfig[];
  defaultProvider?: string;
  autoReview?: boolean;
  reviewRules?: string[];
}

@Injectable()
export class AIConfigService {
  private readonly logger = new Logger(AIConfigService.name);
  private readonly encryptionKey: string;
  private readonly algorithm = 'aes-256-gcm';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    // 使用环境变量中的密钥或生成默认密钥
    this.encryptionKey = this.configService.get<string>('AI_ENCRYPTION_KEY') || 
                        crypto.randomBytes(32).toString('hex').slice(0, 32);
  }

  /**
   * 获取用户的AI配置
   */
  async getUserAIConfig(userId: string): Promise<AISettings | null> {
    try {
      const config = await this.prisma.userAIConfig.findUnique({
        where: { userId },
      });

      if (!config) {
        return null;
      }

      // 解密API密钥
      const settings = JSON.parse(config.settings as string) as AISettings;
      if (settings.providers) {
        settings.providers = settings.providers.map(provider => ({
          ...provider,
          apiKey: this.decrypt(provider.apiKey),
        }));
      }

      return settings;
    } catch (error) {
      this.logger.error(`获取用户AI配置失败: ${userId}`, error);
      return null;
    }
  }

  /**
   * 保存用户的AI配置
   */
  async saveUserAIConfig(userId: string, settings: AISettings): Promise<AISettings> {
    try {
      // 加密API密钥
      const encryptedSettings = {
        ...settings,
        providers: settings.providers.map(provider => ({
          ...provider,
          apiKey: this.encrypt(provider.apiKey),
        })),
      };

      await this.prisma.userAIConfig.upsert({
        where: { userId },
        create: {
          userId,
          settings: JSON.stringify(encryptedSettings),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        update: {
          settings: JSON.stringify(encryptedSettings),
          updatedAt: new Date(),
        },
      });

      return settings;
    } catch (error) {
      this.logger.error(`保存用户AI配置失败: ${userId}`, error);
      throw new Error('保存AI配置失败');
    }
  }

  /**
   * 删除用户的AI配置
   */
  async deleteUserAIConfig(userId: string): Promise<void> {
    try {
      await this.prisma.userAIConfig.delete({
        where: { userId },
      });
    } catch (error) {
      this.logger.error(`删除用户AI配置失败: ${userId}`, error);
      throw new Error('删除AI配置失败');
    }
  }

  /**
   * 获取特定提供商的配置
   */
  async getProviderConfig(
    userId: string,
    provider: string,
  ): Promise<AIProviderConfig | null> {
    const settings = await this.getUserAIConfig(userId);
    if (!settings || !settings.providers) {
      return null;
    }

    return settings.providers.find(p => p.provider === provider) || null;
  }

  /**
   * 加密文本
   */
  private encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(
        this.algorithm,
        Buffer.from(this.encryptionKey, 'utf-8'),
        iv,
      );

      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    } catch (error) {
      this.logger.error('加密失败:', error);
      throw new Error('加密失败');
    }
  }

  /**
   * 解密文本
   */
  private decrypt(encryptedText: string): string {
    try {
      const parts = encryptedText.split(':');
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      const decipher = crypto.createDecipheriv(
        this.algorithm,
        Buffer.from(this.encryptionKey, 'utf-8'),
        iv,
      );
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      this.logger.error('解密失败:', error);
      throw new Error('解密失败');
    }
  }

  /**
   * 验证API密钥格式
   */
  validateApiKey(provider: string, apiKey: string): boolean {
    switch (provider) {
      case 'kimi':
        // Kimi API key format: sk-...
        return /^sk-[a-zA-Z0-9]{32,}$/.test(apiKey);
      case 'openai':
        // OpenAI API key format: sk-...
        return /^sk-[a-zA-Z0-9]{32,}$/.test(apiKey);
      case 'anthropic':
        // Anthropic API key format
        return /^sk-ant-[a-zA-Z0-9]{32,}$/.test(apiKey);
      default:
        // 默认验证：至少16个字符
        return apiKey.length >= 16;
    }
  }

  /**
   * 获取系统默认AI配置
   * 从环境变量或配置文件中读取
   */
  async getDefaultAIConfig(): Promise<AIProviderConfig | null> {
    try {
      // 从环境变量中获取默认配置
      const provider = this.configService.get<string>('DEFAULT_AI_PROVIDER') || 'kimi';
      const apiKey = this.configService.get<string>('DEFAULT_AI_API_KEY') || 
                     this.configService.get<string>('KIMI_API_KEY');
      const apiUrl = this.configService.get<string>('DEFAULT_AI_API_URL') ||
                     this.configService.get<string>('KIMI_API_URL') ||
                     'https://api.moonshot.cn/v1';
      const model = this.configService.get<string>('DEFAULT_AI_MODEL') ||
                    this.configService.get<string>('KIMI_MODEL') ||
                    'kimi-k2-0905-preview';

      if (!apiKey) {
        this.logger.warn('系统未配置默认AI API密钥');
        return null;
      }

      return {
        provider,
        apiKey,
        apiUrl,
        model,
        maxTokens: 4000,
        temperature: 0.7,
        enabled: true,
      };
    } catch (error) {
      this.logger.error('获取默认AI配置失败:', error);
      return null;
    }
  }

  /**
   * 获取支持的AI提供商列表
   */
  getSupportedProviders(): Array<{
    name: string;
    displayName: string;
    models: string[];
    defaultModel: string;
  }> {
    return [
      {
        name: 'kimi',
        displayName: 'Kimi (Moonshot)',
        models: [
          'kimi-k2-0905-preview',
          'kimi-k1.5-0828-preview', 
          'moonshot-v1-8k',
          'moonshot-v1-32k',
          'moonshot-v1-128k'
        ],
        defaultModel: 'kimi-k2-0905-preview',
      },
      {
        name: 'openai',
        displayName: 'OpenAI',
        models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        defaultModel: 'gpt-4',
      },
      {
        name: 'anthropic',
        displayName: 'Anthropic Claude',
        models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
        defaultModel: 'claude-3-sonnet',
      },
    ];
  }
}