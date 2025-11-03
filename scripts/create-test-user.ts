import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // 创建测试用户
  const password = await bcrypt.hash('Test@123456', 10);
  
  // 先尝试通过用户名查找用户
  let user = await prisma.user.findUnique({
    where: { username: 'moonlenstest' }
  });

  if (user) {
    // 如果用户存在，更新密码
    user = await prisma.user.update({
      where: { username: 'moonlenstest' },
      data: {
        password: password,
        isActive: true,
        isLocked: false,
        loginAttempts: 0,
      },
    });
    console.log('更新用户密码成功:', user.email, '- 密码已设置为: Test@123456');
  } else {
    // 如果用户不存在，创建新用户
    console.log('用户名 moonlenstest 不存在，尝试创建新用户...');
    user = await prisma.user.create({
      data: {
        email: 'moonlens@test.com',
        username: 'moonlenstest',
        password: password,
        fullName: 'MoonLens Test User',
        role: 'USER',
        isActive: true,
      },
    });
    console.log('创建用户成功:', user.email);
  }
  
  console.log('用户信息:', {
    id: user.id,
    email: user.email,
    username: user.username,
    isActive: user.isActive,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });