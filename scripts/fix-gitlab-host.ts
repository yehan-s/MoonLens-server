import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixGitLabHost() {
  try {
    // 更新GitLab连接的host字段，添加http://前缀
    const updated = await prisma.gitlabConnection.update({
      where: { id: 'e0125103-235d-4ff8-a09e-23735f064798' },
      data: {
        host: 'http://gitlab.sunyur.com'
      }
    });
    
    console.log('✅ GitLab连接host已更新!');
    console.log('新的host:', updated.host);
    
  } catch (error) {
    console.error('更新失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixGitLabHost();