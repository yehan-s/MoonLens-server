import { PrismaClient } from '@prisma/client';
import { encryptSecret } from '../src/common/utils/crypto.util';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function createAdminUser() {
  try {
    console.log('创建管理员用户...');
    
    // 检查是否已存在管理员用户
    const existingAdmin = await prisma.user.findUnique({
      where: { email: 'admin@moonlens.com' }
    });
    
    if (existingAdmin) {
      console.log('管理员用户已存在');
      return existingAdmin;
    }
    
    // 创建管理员用户 - 使用bcrypt格式
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    
    const admin = await prisma.user.create({
      data: {
        email: 'admin@moonlens.com',
        username: 'admin',
        fullName: 'Administrator',
        password: hashedPassword,
        role: 'ADMIN' as any,
        isActive: true
      }
    });
    
    console.log('管理员用户创建成功:', admin.email);
    return admin;
    
  } catch (error) {
    console.error('创建管理员用户失败:', error);
  }
}

async function ensureGitLabConnection() {
  try {
    console.log('\n检查GitLab连接...');
    
    // 查找现有连接
    let connection = await prisma.gitlabConnection.findFirst({
      where: {
        host: 'gitlab.sunyur.com',
        isActive: true
      }
    });
    
    if (connection) {
      console.log(`GitLab连接已存在: ${connection.name}`);
      return connection;
    }
    
    // 创建新连接
    const token = process.env.GITLAB_PERSONAL_ACCESS_TOKEN || 'em7zaFQvYzGjxC2gpVPs';
    const tokenCipher = encryptSecret(token);
    
    // 先获取管理员用户
    const admin = await createAdminUser();
    if (!admin) {
      throw new Error('无法创建管理员用户');
    }
    
    connection = await prisma.gitlabConnection.create({
      data: {
        name: 'Main GitLab',
        host: 'gitlab.sunyur.com',
        authType: 'PAT',
        tokenCipher: tokenCipher,
        isActive: true,
        userId: admin.id
      }
    });
    
    console.log('GitLab连接创建成功:', connection.name);
    return connection;
    
  } catch (error) {
    console.error('设置GitLab连接失败:', error);
    throw error;
  }
}

async function main() {
  try {
    // 创建管理员用户
    const admin = await createAdminUser();
    
    // 确保GitLab连接存在
    const connection = await ensureGitLabConnection();
    
    if (connection && admin) {
      console.log('\n✅ 设置完成!');
      console.log('\n📧 登录凭据:');
      console.log('邮箱: admin@moonlens.com');
      console.log('密码: Admin@123');
      console.log('\n🔗 GitLab连接信息:');
      console.log('连接ID:', connection.id);
      console.log('连接名称:', connection.name);
      console.log('GitLab主机:', connection.host);
      console.log('\n📡 同步项目API:');
      console.log(`POST http://localhost:3000/api/gitlab/connections/${connection.id}/sync-projects`);
      console.log('\n💡 提示: 登录后可以通过API触发项目同步');
    }
    
  } catch (error) {
    console.error('设置失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();