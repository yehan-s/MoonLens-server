import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 刷新令牌 DTO
 */
export class RefreshTokenDto {
  @ApiProperty({
    description: '刷新令牌',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty({ message: '刷新令牌不能为空' })
  refreshToken: string;
}
