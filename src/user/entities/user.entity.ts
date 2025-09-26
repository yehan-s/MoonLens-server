import { ApiProperty, ApiHideProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';
import {
  IsEmail,
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsUUID,
  IsUrl,
  MinLength,
  MaxLength,
  Matches,
  IsDateString,
  IsInt,
  Min,
  IsJSON,
} from 'class-validator';

/**
 * 用户实体
 * 包含认证、资料、OAuth集成、状态管理等字段
 */
export class User {
  @ApiProperty({
    description: '用户唯一标识符',
    example: 'c3d7e5f2-4a2b-4e7c-8f2d-3e4f5a6b7c8d',
  })
  @IsUUID()
  @Expose()
  id: string;

  @ApiProperty({
    description: '用户名',
    example: 'johndoe',
    minLength: 3,
    maxLength: 50,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: '用户名只能包含字母、数字、下划线和横线',
  })
  @Expose()
  username: string;

  @ApiProperty({
    description: '电子邮箱',
    example: 'john@example.com',
  })
  @IsEmail()
  @Expose()
  email: string;

  @ApiHideProperty()
  @Exclude()
  password: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  @Exclude()
  salt?: string;

  @ApiProperty({
    description: '用户全名',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Expose()
  fullName?: string;

  @ApiProperty({
    description: '用户头像URL',
    example: 'https://example.com/avatar.jpg',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  @Expose()
  avatar?: string;

  @ApiProperty({
    description: '用户角色',
    enum: UserRole,
    default: UserRole.USER,
  })
  @IsEnum(UserRole)
  @Expose()
  role: UserRole;

  @ApiProperty({
    description: '账户激活状态',
    default: true,
  })
  @IsBoolean()
  @Expose()
  isActive: boolean;

  @ApiProperty({
    description: '账户锁定状态',
    default: false,
  })
  @IsBoolean()
  @Expose()
  isLocked: boolean;

  @ApiProperty({
    description: '失败登录尝试次数',
    default: 0,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  @Expose()
  loginAttempts: number;

  @ApiProperty({
    description: '账户锁定截止时间',
    required: false,
    type: Date,
  })
  @IsOptional()
  @IsDateString()
  @Expose()
  lockedUntil?: Date;

  @ApiProperty({
    description: '最后登录时间',
    required: false,
    type: Date,
  })
  @IsOptional()
  @IsDateString()
  @Expose()
  lastLoginAt?: Date;

  @ApiProperty({
    description: '最后登录IP地址',
    required: false,
    example: '192.168.1.1',
  })
  @IsOptional()
  @IsString()
  @Expose()
  lastLoginIp?: string;

  @ApiProperty({
    description: '邮箱验证状态',
    default: false,
  })
  @IsBoolean()
  @Expose()
  emailVerified: boolean;

  @ApiProperty({
    description: '邮箱验证时间',
    required: false,
    type: Date,
  })
  @IsOptional()
  @IsDateString()
  @Expose()
  emailVerifiedAt?: Date;

  @ApiProperty({
    description: 'GitLab用户ID',
    required: false,
    example: '12345',
  })
  @IsOptional()
  @IsString()
  @Expose()
  gitlabUserId?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  @Exclude()
  gitlabAccessToken?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  @Exclude()
  gitlabRefreshToken?: string;

  @ApiProperty({
    description: '用户偏好设置',
    required: false,
    
  })
  @IsOptional()
  @IsJSON()
  @Expose()
  preferences?: any;

  @ApiProperty({
    description: '创建时间',
    type: Date,
  })
  @IsDateString()
  @Expose()
  createdAt: Date;

  @ApiProperty({
    description: '更新时间',
    type: Date,
  })
  @IsDateString()
  @Expose()
  updatedAt: Date;

  /**
   * 构造函数
   * @param partial 部分用户数据
   */
  constructor(partial: Partial<User>) {
    Object.assign(this, partial);
  }

  /**
   * 检查账户是否被锁定
   */
  isAccountLocked(): boolean {
    if (!this.isLocked || !this.lockedUntil) {
      return false;
    }
    
    // 如果锁定时间已过，账户应该被解锁
    if (new Date() > new Date(this.lockedUntil)) {
      return false;
    }
    
    return true;
  }

  /**
   * 检查是否需要锁定账户（基于失败尝试次数）
   */
  shouldLockAccount(): boolean {
    return this.loginAttempts >= 5;
  }

  /**
   * 获取锁定持续时间（毫秒）
   */
  getLockDuration(): number {
    // 锁定15分钟
    return 15 * 60 * 1000;
  }

  /**
   * 重置登录尝试次数
   */
  resetLoginAttempts(): void {
    this.loginAttempts = 0;
    this.isLocked = false;
    this.lockedUntil = undefined;
  }

  /**
   * 增加登录尝试次数
   */
  incrementLoginAttempts(): void {
    this.loginAttempts++;
    
    if (this.shouldLockAccount()) {
      this.isLocked = true;
      this.lockedUntil = new Date(Date.now() + this.getLockDuration());
    }
  }

  /**
   * 更新最后登录信息
   */
  updateLastLogin(ip?: string): void {
    this.lastLoginAt = new Date();
    if (ip) {
      this.lastLoginIp = ip;
    }
    this.resetLoginAttempts();
  }

  /**
   * 判断是否有 GitLab 集成
   */
  hasGitLabIntegration(): boolean {
    return !!this.gitlabUserId && !!this.gitlabAccessToken;
  }

  /**
   * 判断是否需要邮箱验证
   */
  needsEmailVerification(): boolean {
    return !this.emailVerified;
  }

  /**
   * 判断是否可以登录
   */
  canLogin(): boolean {
    return this.isActive && !this.isAccountLocked();
  }

  /**
   * 获取公开的用户信息（排除敏感字段）
   */
  toPublicJSON(): Partial<User> {
    const { 
      password, 
      salt, 
      gitlabAccessToken, 
      gitlabRefreshToken,
      loginAttempts,
      lockedUntil,
      ...publicData 
    } = this;
    
    return publicData;
  }

  /**
   * 获取安全的用户信息（用于JWT payload）
   */
  toJWTPayload(): {
    userId: string;
    email: string;
    username: string;
    role: UserRole;
  } {
    return {
      userId: this.id,
      email: this.email,
      username: this.username,
      role: this.role,
    };
  }
}

/**
 * 创建用户 DTO
 */
export class CreateUserDto {
  @ApiProperty({
    description: '用户名',
    example: 'johndoe',
    minLength: 3,
    maxLength: 50,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: '用户名只能包含字母、数字、下划线和横线',
  })
  username: string;

  @ApiProperty({
    description: '电子邮箱',
    example: 'john@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: '密码',
    example: 'SecurePass123',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/, {
    message: '密码必须包含至少8个字符，包括大写字母、小写字母和数字',
  })
  password: string;

  @ApiProperty({
    description: '用户全名',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullName?: string;
}

/**
 * 更新用户 DTO
 */
export class UpdateUserDto {
  @ApiProperty({
    description: '用户名',
    example: 'johndoe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: '用户名只能包含字母、数字、下划线和横线',
  })
  username?: string;

  @ApiProperty({
    description: '用户全名',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullName?: string;

  @ApiProperty({
    description: '用户头像URL',
    example: 'https://example.com/avatar.jpg',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  avatar?: string;

  @ApiProperty({
    description: '用户偏好设置',
    required: false,
  })
  @IsOptional()
  @IsJSON()
  preferences?: any;
}

/**
 * 用户响应 DTO（用于API响应）
 */
export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ required: false })
  fullName?: string;

  @ApiProperty({ required: false })
  avatar?: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  emailVerified: boolean;

  @ApiProperty({ required: false })
  gitlabUserId?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  constructor(user: User) {
    this.id = user.id;
    this.username = user.username;
    this.email = user.email;
    this.fullName = user.fullName;
    this.avatar = user.avatar;
    this.role = user.role;
    this.isActive = user.isActive;
    this.emailVerified = user.emailVerified;
    this.gitlabUserId = user.gitlabUserId;
    this.createdAt = user.createdAt;
    this.updatedAt = user.updatedAt;
  }
}