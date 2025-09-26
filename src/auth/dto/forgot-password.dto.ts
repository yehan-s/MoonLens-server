import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ description: '注册邮箱' })
  @IsEmail()
  email: string;
}

