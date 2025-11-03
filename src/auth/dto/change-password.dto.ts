import { IsString, MinLength, Matches, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({
    description: '当前密码',
    example: 'OldPassword123',
  })
  @IsNotEmpty({ message: '当前密码不能为空' })
  @IsString()
  oldPassword: string;

  @ApiProperty({
    description: '新密码',
    example: 'NewPassword123',
    minLength: 6,
  })
  @IsNotEmpty({ message: '新密码不能为空' })
  @IsString()
  @MinLength(6, { message: '密码长度不能少于6位' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&#]{6,}$/,
    {
      message: '密码必须包含大小写字母和数字',
    },
  )
  newPassword: string;
}