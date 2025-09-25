import { IsEmail, IsString, MinLength, MaxLength, Matches, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 用户注册 DTO
 */
export class RegisterDto {
  @ApiProperty({
    description: '用户邮箱',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email: string;

  @ApiProperty({
    description: '用户名',
    example: 'johndoe',
    minLength: 3,
    maxLength: 20,
  })
  @IsString()
  @MinLength(3, { message: '用户名至少需要3个字符' })
  @MaxLength(20, { message: '用户名不能超过20个字符' })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: '用户名只能包含字母、数字、下划线和横线',
  })
  username: string;

  @ApiProperty({
    description: '密码',
    example: 'SecurePass123',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: '密码至少需要8个字符' })
  @MaxLength(128, { message: '密码不能超过128个字符' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/,
    {
      message: '密码必须包含大写字母、小写字母和数字',
    },
  )
  password: string;

  @ApiProperty({
    description: '用户全名',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: '全名不能超过100个字符' })
  fullName?: string;
}