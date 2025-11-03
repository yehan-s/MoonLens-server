-- 创建 platform_tokens 表
USE moonlens_db;

CREATE TABLE IF NOT EXISTS `platform_tokens` (
  `id` VARCHAR(36) PRIMARY KEY,
  `userId` VARCHAR(36) NOT NULL,
  `platform` VARCHAR(20) NOT NULL,
  `accessToken` TEXT NOT NULL,
  `refreshToken` TEXT,
  `expiresAt` DATETIME,
  `apiUrl` VARCHAR(255),
  `authMethod` VARCHAR(10) DEFAULT 'oauth',
  `platformUserId` VARCHAR(50),
  `platformUsername` VARCHAR(100),
  `platformEmail` VARCHAR(255),
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `userId_platform` (`userId`, `platform`),
  KEY `idx_userId` (`userId`),
  KEY `idx_platform` (`platform`),
  CONSTRAINT `fk_platform_tokens_user` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 验证表结构
DESCRIBE platform_tokens;
