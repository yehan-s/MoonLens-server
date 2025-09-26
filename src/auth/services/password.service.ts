import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

/**
 * 密码加密服务
 * 提供密码哈希、验证和强度检查功能
 */
@Injectable()
export class PasswordService {
  private readonly SALT_ROUNDS = 10;

  // 密码强度规则
  private readonly PASSWORD_RULES = {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: false, // 可选的特殊字符
  };

  /**
   * 哈希密码
   * @param password 原始密码
   * @returns 哈希后的密码
   */
  async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, this.SALT_ROUNDS);
  }

  /**
   * 验证密码
   * @param plainPassword 原始密码
   * @param hashedPassword 哈希密码
   * @returns 是否匹配
   */
  async verifyPassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * 检查密码强度
   * @param password 要检查的密码
   * @returns 密码强度检查结果
   */
  validatePasswordStrength(password: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // 检查密码长度
    if (password.length < this.PASSWORD_RULES.minLength) {
      errors.push(`密码长度至少需要 ${this.PASSWORD_RULES.minLength} 个字符`);
    }

    if (password.length > this.PASSWORD_RULES.maxLength) {
      errors.push(`密码长度不能超过 ${this.PASSWORD_RULES.maxLength} 个字符`);
    }

    // 检查是否包含大写字母
    if (this.PASSWORD_RULES.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('密码必须包含至少一个大写字母');
    }

    // 检查是否包含小写字母
    if (this.PASSWORD_RULES.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('密码必须包含至少一个小写字母');
    }

    // 检查是否包含数字
    if (this.PASSWORD_RULES.requireNumbers && !/\d/.test(password)) {
      errors.push('密码必须包含至少一个数字');
    }

    // 检查是否包含特殊字符
    if (
      this.PASSWORD_RULES.requireSpecialChars &&
      !/[!@#$%^&*(),.?":{}|<>]/.test(password)
    ) {
      errors.push('密码必须包含至少一个特殊字符');
    }

    // 检查常见弱密码
    const commonWeakPasswords = [
      'password',
      '12345678',
      'qwerty',
      'abc123',
      'password123',
      'admin',
      'letmein',
      'welcome',
    ];

    if (commonWeakPasswords.includes(password.toLowerCase())) {
      errors.push('密码过于简单，请使用更复杂的密码');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * 生成随机密码
   * @param length 密码长度
   * @returns 生成的随机密码
   */
  generateRandomPassword(length: number = 16): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-={}[]|:;<>?,.';

    let charset = lowercase + uppercase + numbers;
    if (this.PASSWORD_RULES.requireSpecialChars) {
      charset += special;
    }

    let password = '';

    // 确保至少包含各类字符
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];

    if (this.PASSWORD_RULES.requireSpecialChars) {
      password += special[Math.floor(Math.random() * special.length)];
    }

    // 填充剩余长度
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }

    // 打乱密码字符顺序
    return password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
  }

  /**
   * 比较两个密码是否相同
   * @param password1 第一个密码
   * @param password2 第二个密码
   * @returns 是否相同
   */
  comparePasswords(password1: string, password2: string): boolean {
    return password1 === password2;
  }

  /**
   * 获取密码规则配置
   * @returns 密码规则
   */
  getPasswordRules() {
    return { ...this.PASSWORD_RULES };
  }
}
