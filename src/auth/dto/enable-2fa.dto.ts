import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class Enable2FADto {
  @ApiProperty({ description: 'TOTP 明文密钥（来自 /auth/2fa/setup）' })
  @IsString()
  @MinLength(16)
  secret: string;

  @ApiProperty({ description: '当前一次性验证码' })
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}

