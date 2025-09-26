import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiProperty,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { IsString, IsEmail, MinLength, Matches } from 'class-validator';
import { UsersService } from '../users.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UpdateUserDto, UserResponseDto } from '../../user/entities/user.entity';
import { PasswordService } from '../../auth/services/password.service';
// import * as sharp from 'sharp'; // 暂时注释，需要安装
import * as fs from 'fs/promises';

/**
 * 修改密码 DTO
 */
export class ChangePasswordDto {
  @ApiProperty({ description: '当前密码' })
  @IsString()
  @MinLength(8)
  oldPassword: string;

  @ApiProperty({ description: '新密码' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/, {
    message: '密码必须包含至少8个字符，包括大写字母、小写字母和数字',
  })
  newPassword: string;

  @ApiProperty({ description: '确认新密码' })
  @IsString()
  confirmPassword: string;
}

/**
 * 修改邮箱 DTO
 */
export class ChangeEmailDto {
  @ApiProperty({ description: '新邮箱地址' })
  @IsEmail()
  newEmail: string;

  @ApiProperty({ description: '当前密码（验证身份）' })
  @IsString()
  password: string;
}

@ApiTags('用户管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
  ) {}

  /**
   * 获取当前用户资料
   */
  @Get('profile')
  @ApiOperation({ summary: '获取当前用户资料' })
  @ApiResponse({
    status: 200,
    description: '返回用户资料',
    type: UserResponseDto,
  })
  async getProfile(@CurrentUser() user: any): Promise<UserResponseDto> {
    const userData = await this.usersService.findOne(user.userId);
    return new UserResponseDto(userData as any);
  }

  /**
   * 更新用户资料
   */
  @Put('profile')
  @ApiOperation({ summary: '更新用户资料' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({
    status: 200,
    description: '用户资料更新成功',
    type: UserResponseDto,
  })
  async updateProfile(
    @CurrentUser() user: any,
    @Body() updateDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const updatedUser = await this.usersService.update(user.userId, updateDto);
    return new UserResponseDto(updatedUser as any);
  }

  /**
   * 上传头像
   */
  @Post('avatar')
  @ApiOperation({ summary: '上传用户头像' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: '头像文件',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '头像上传成功',
    schema: {
      type: 'object',
      properties: {
        avatarUrl: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/avatars',
        filename: (req, file, cb) => {
          // 生成唯一文件名
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        // 只允许图片文件
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif)$/)) {
          return cb(new BadRequestException('只允许上传图片文件'), false);
        }
        cb(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ avatarUrl: string }> {
    if (!file) {
      throw new BadRequestException('请上传头像文件');
    }

    try {
      // 处理图片：调整大小和压缩
      const processedFileName = `processed_${file.filename}`;
      const processedPath = `./uploads/avatars/${processedFileName}`;
      
      await (await import('sharp')).default(file.path)
        .resize(200, 200, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: 90 })
        .toFile(processedPath);

      // 删除原始文件
      await fs.unlink(file.path);

      // 更新用户头像URL
      const avatarUrl = `/uploads/avatars/${processedFileName}`;
      await this.usersService.update(user.userId, { avatar: avatarUrl });

      return { avatarUrl };
    } catch (error) {
      // 清理上传的文件
      try {
        await fs.unlink(file.path);
      } catch (e) {
        // 忽略删除错误
      }
      throw new BadRequestException('头像处理失败');
    }
  }

  /**
   * 修改密码
   */
  @Post('change-password')
  @ApiOperation({ summary: '修改密码' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({
    status: 200,
    description: '密码修改成功',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  async changePassword(
    @CurrentUser() user: any,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const { oldPassword, newPassword, confirmPassword } = changePasswordDto;

    // 验证新密码和确认密码是否一致
    if (newPassword !== confirmPassword) {
      throw new BadRequestException('新密码和确认密码不一致');
    }

    // 验证旧密码
    const currentUser = await this.usersService.findOne(user.userId);
    const isValidPassword = await this.passwordService.verifyPassword(
      oldPassword,
      currentUser.password,
    );

    if (!isValidPassword) {
      throw new UnauthorizedException('当前密码错误');
    }

    // 检查新密码强度
    const passwordStrength = this.passwordService.validatePasswordStrength(newPassword);
    if (!passwordStrength.isValid) {
      throw new BadRequestException(passwordStrength.errors.join(', '));
    }

    // 更新密码
    const hashedPassword = await this.passwordService.hashPassword(newPassword);
    await this.usersService.update(user.userId, { password: hashedPassword });

    // TODO: 使所有现有的 Token 失效，要求重新登录

    return { message: '密码修改成功，请重新登录' };
  }

  /**
   * 修改邮箱
   */
  @Post('change-email')
  @ApiOperation({ summary: '修改邮箱地址' })
  @ApiBody({ type: ChangeEmailDto })
  @ApiResponse({
    status: 200,
    description: '邮箱修改请求已发送',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  async changeEmail(
    @CurrentUser() user: any,
    @Body() changeEmailDto: ChangeEmailDto,
  ): Promise<{ message: string }> {
    const { newEmail, password } = changeEmailDto;

    // 验证密码
    const currentUser = await this.usersService.findOne(user.userId);
    const isValidPassword = await this.passwordService.verifyPassword(
      password,
      currentUser.password,
    );

    if (!isValidPassword) {
      throw new UnauthorizedException('密码错误');
    }

    // 检查新邮箱是否已被使用
    const existingUser = await this.usersService.findByEmail(newEmail);
    if (existingUser) {
      throw new BadRequestException('该邮箱已被注册');
    }

    // TODO: 发送邮箱验证邮件
    // 这里应该：
    // 1. 生成邮箱验证令牌
    // 2. 发送验证邮件到新邮箱
    // 3. 用户点击验证链接后才真正更新邮箱

    // 暂时直接更新邮箱（实际生产环境需要邮箱验证）
    await this.usersService.update(user.userId, { 
      email: newEmail,
      emailVerified: false,
    });

    return { 
      message: '邮箱修改成功，请查收验证邮件' 
    };
  }

  /**
   * 获取用户活动日志
   */
  @Get('activity-logs')
  @ApiOperation({ summary: '获取用户活动日志' })
  @ApiResponse({
    status: 200,
    description: '返回用户活动日志列表',
  })
  async getActivityLogs(@CurrentUser() user: any) {
    // TODO: 实现活动日志查询
    return {
      logs: [],
      message: '功能开发中',
    };
  }

  /**
   * 获取用户偏好设置
   */
  @Get('preferences')
  @ApiOperation({ summary: '获取用户偏好设置' })
  @ApiResponse({
    status: 200,
    description: '返回用户偏好设置',
  })
  async getPreferences(@CurrentUser() user: any) {
    const userData = await this.usersService.findOne(user.userId);
    return userData.preferences || {};
  }

  /**
   * 更新用户偏好设置
   */
  @Put('preferences')
  @ApiOperation({ summary: '更新用户偏好设置' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  })
  @ApiResponse({
    status: 200,
    description: '偏好设置更新成功',
  })
  async updatePreferences(
    @CurrentUser() user: any,
    @Body() preferences: any,
  ) {
    await this.usersService.update(user.userId, { preferences });
    return { 
      message: '偏好设置更新成功',
      preferences,
    };
  }

  /**
   * 删除账户
   */
  @Post('delete-account')
  @ApiOperation({ summary: '删除用户账户' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        password: { type: 'string', description: '当前密码' },
        confirmation: { type: 'string', description: '确认删除（输入 DELETE）' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '账户删除成功',
  })
  async deleteAccount(
    @CurrentUser() user: any,
    @Body() body: { password: string; confirmation: string },
  ): Promise<{ message: string }> {
    const { password, confirmation } = body;

    // 验证确认文本
    if (confirmation !== 'DELETE') {
      throw new BadRequestException('请输入 DELETE 以确认删除账户');
    }

    // 验证密码
    const currentUser = await this.usersService.findOne(user.userId);
    const isValidPassword = await this.passwordService.verifyPassword(
      password,
      currentUser.password,
    );

    if (!isValidPassword) {
      throw new UnauthorizedException('密码错误');
    }

    // 软删除用户（将 isActive 设为 false）
    await this.usersService.update(user.userId, { 
      isActive: false,
      email: `deleted_${Date.now()}_${currentUser.email}`, // 释放邮箱
      username: `deleted_${Date.now()}_${currentUser.username}`, // 释放用户名
    });

    // TODO: 使所有 Token 失效

    return { 
      message: '账户已删除' 
    };
  }
}