import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/services/prisma.service';
import { User, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // 创建用户
  async create(data: {
    username: string;
    email: string;
    password: string;
    fullName?: string;
  }): Promise<User> {
    // 检查用户是否已存在
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: data.username },
          { email: data.email },
        ],
      },
    });

    if (existingUser) {
      throw new ConflictException('用户名或邮箱已存在');
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // 创建用户
    return this.prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
      },
    });
  }

  // 查找所有用户
  async findAll(params?: {
    skip?: number;
    take?: number;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }): Promise<User[]> {
    const { skip, take, where, orderBy } = params || {};
    return this.prisma.user.findMany({
      skip,
      take,
      where,
      orderBy,
    });
  }

  // 根据 ID 查找用户
  async findOne(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        projects: true,
        reviews: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }

  // 根据邮箱查找用户
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  // 根据用户名查找用户
  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  // 更新用户
  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    try {
      // 如果更新密码，需要加密
      if (data.password && typeof data.password === 'string') {
        data.password = await bcrypt.hash(data.password, 10);
      }

      return await this.prisma.user.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException('用户不存在');
      }
      throw error;
    }
  }

  // 删除用户
  async remove(id: string): Promise<User> {
    try {
      return await this.prisma.user.delete({
        where: { id },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException('用户不存在');
      }
      throw error;
    }
  }

  // 验证用户密码
  async validatePassword(email: string, password: string): Promise<User | null> {
    const user = await this.findByEmail(email);
    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  // 更新 GitLab 令牌
  async updateGitlabToken(userId: string, token: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { gitlabAccessToken: token },
    });
  }
}
