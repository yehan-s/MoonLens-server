import { IsEmail, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 用户登录 DTO
 */
export class LoginDto {
  @ApiProperty({
    description: '用户邮箱',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email: string;

  @ApiProperty({
    description: '密码',
    example: 'SecurePass123',
  })
  @IsString()
  password: string;

  @ApiProperty({
    description: '设备ID（用于多设备管理）',
    example: 'device-123-456',
    required: false,
  })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
