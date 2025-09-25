import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PasswordService],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('密码哈希功能', () => {
    it('应该成功哈希密码', async () => {
      const password = 'Test@123456';
      const hashedPassword = await service.hashPassword(password);

      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toEqual(password);
      expect(hashedPassword.length).toBeGreaterThan(20);
    });

    it('相同密码的哈希值应该不同', async () => {
      const password = 'Test@123456';
      const hash1 = await service.hashPassword(password);
      const hash2 = await service.hashPassword(password);

      expect(hash1).not.toEqual(hash2);
    });
  });

  describe('密码验证功能', () => {
    it('应该验证正确的密码', async () => {
      const password = 'Test@123456';
      const hashedPassword = await service.hashPassword(password);

      const isValid = await service.verifyPassword(password, hashedPassword);
      expect(isValid).toBe(true);
    });

    it('应该拒绝错误的密码', async () => {
      const password = 'Test@123456';
      const wrongPassword = 'Wrong@123456';
      const hashedPassword = await service.hashPassword(password);

      const isValid = await service.verifyPassword(wrongPassword, hashedPassword);
      expect(isValid).toBe(false);
    });
  });

  describe('密码强度验证', () => {
    it('应该接受符合要求的密码', () => {
      const result = service.validatePasswordStrength('ValidPass123');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该拒绝太短的密码', () => {
      const result = service.validatePasswordStrength('Pass1');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('密码长度至少需要 8 个字符');
    });

    it('应该拒绝没有大写字母的密码', () => {
      const result = service.validatePasswordStrength('password123');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('密码必须包含至少一个大写字母');
    });

    it('应该拒绝没有小写字母的密码', () => {
      const result = service.validatePasswordStrength('PASSWORD123');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('密码必须包含至少一个小写字母');
    });

    it('应该拒绝没有数字的密码', () => {
      const result = service.validatePasswordStrength('ValidPassword');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('密码必须包含至少一个数字');
    });

    it('应该拒绝常见弱密码', () => {
      const weakPasswords = ['password', '12345678', 'qwerty', 'abc123'];
      
      weakPasswords.forEach(password => {
        const result = service.validatePasswordStrength(password);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('密码过于简单，请使用更复杂的密码');
      });
    });

    it('应该返回多个错误信息', () => {
      const result = service.validatePasswordStrength('pass');
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('生成随机密码', () => {
    it('应该生成指定长度的密码', () => {
      const password = service.generateRandomPassword(16);
      
      expect(password).toBeDefined();
      expect(password.length).toBe(16);
    });

    it('生成的密码应该满足强度要求', () => {
      const password = service.generateRandomPassword(12);
      const result = service.validatePasswordStrength(password);
      
      expect(result.isValid).toBe(true);
    });

    it('每次生成的密码应该不同', () => {
      const password1 = service.generateRandomPassword(16);
      const password2 = service.generateRandomPassword(16);
      
      expect(password1).not.toEqual(password2);
    });

    it('应该包含所需的字符类型', () => {
      const password = service.generateRandomPassword(20);
      
      expect(/[A-Z]/.test(password)).toBe(true); // 大写字母
      expect(/[a-z]/.test(password)).toBe(true); // 小写字母
      expect(/\d/.test(password)).toBe(true);    // 数字
    });
  });

  describe('密码比较', () => {
    it('应该正确比较相同的密码', () => {
      const password1 = 'Test@123456';
      const password2 = 'Test@123456';
      
      const result = service.comparePasswords(password1, password2);
      expect(result).toBe(true);
    });

    it('应该正确比较不同的密码', () => {
      const password1 = 'Test@123456';
      const password2 = 'Test@654321';
      
      const result = service.comparePasswords(password1, password2);
      expect(result).toBe(false);
    });
  });

  describe('获取密码规则', () => {
    it('应该返回密码规则配置', () => {
      const rules = service.getPasswordRules();
      
      expect(rules).toBeDefined();
      expect(rules.minLength).toBe(8);
      expect(rules.maxLength).toBe(128);
      expect(rules.requireUppercase).toBe(true);
      expect(rules.requireLowercase).toBe(true);
      expect(rules.requireNumbers).toBe(true);
    });
  });
});