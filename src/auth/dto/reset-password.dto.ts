import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, Matches } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: '密码重置令牌' })
  @IsString()
  token: string;

  @ApiProperty({ description: '新密码' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/)
  newPassword: string;
}

