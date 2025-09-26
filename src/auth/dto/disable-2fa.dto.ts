import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class Disable2FADto {
  @ApiProperty({ description: '当前一次性验证码' })
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}

