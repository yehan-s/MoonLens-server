import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import csurf from 'csurf';
import cookieParser from 'cookie-parser';

/**
 * 应用全局安全中间件
 * - Helmet: 安全响应头（XSS/Clickjacking/内容安全策略等基础防护）
 * - CSRF: 可选的跨站请求伪造防护（默认仅在生产环境启用）
 */
export function applySecurityMiddlewares(app: INestApplication) {
  // Helmet 安全头
  app.use(
    helmet({
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginEmbedderPolicy: false, // 与 Swagger/前端资源兼容
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // CSRF 防护（默认在生产启用；也可通过 CSRF_ENABLE=true 强制启用）
  const enableCsrf = process.env.CSRF_ENABLE === 'true' || process.env.NODE_ENV === 'production';
  if (enableCsrf) {
    app.use(cookieParser());
    app.use(
      csurf({
        cookie: {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
        },
        value: (req) => (req.headers['x-csrf-token'] as string) || '',
      }) as any,
    );
  }
}
