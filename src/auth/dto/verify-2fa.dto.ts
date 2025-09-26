import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class Verify2FADto {
  @ApiProperty({ description: '两步验证挑战令牌' })
  @IsString()
  twoFactorToken: string;

  @ApiProperty({ description: '一次性验证码' })
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;

  @ApiProperty({ required: false, description: '设备ID' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}

