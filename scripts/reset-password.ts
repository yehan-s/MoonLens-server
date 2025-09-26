import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function resetPassword() {
  try {
    // 重置管理员密码
    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    
    const updated = await prisma.user.update({
      where: { email: 'admin@moonlens.com' },
      data: {
        password: hashedPassword,
        isActive: true,
        isLocked: false,
        loginAttempts: 0,
        lockedUntil: null
      }
    });
    
    console.log('✅ 密码重置成功!');
    console.log('邮箱: admin@moonlens.com');
    console.log('密码: Admin@123');
    
  } catch (error) {
    console.error('密码重置失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetPassword();