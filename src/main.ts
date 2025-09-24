import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const configService = app.get(ConfigService);
  const port = configService.get('PORT') || 3000;
  
  // 全局验证管道
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));
  
  // CORS 配置
  app.enableCors({
    origin: true, // 在生产环境中应该设置具体的域名
    credentials: true,
  });
  
  // API 前缀
  app.setGlobalPrefix('api');
  
  // Swagger 文档配置
  const config = new DocumentBuilder()
    .setTitle('MoonLens API')
    .setDescription('GitLab 原生 AI 代码审查工具 API 文档')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', '认证相关')
    .addTag('users', '用户管理')
    .addTag('projects', '项目管理')
    .addTag('gitlab', 'GitLab 集成')
    .addTag('review', '代码审查')
    .addTag('ai', 'AI 服务')
    .build();
    
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);
  
  await app.listen(port);
  console.log(`🚀 MoonLens Server 运行在: http://localhost:${port}`);
  console.log(`📚 API 文档地址: http://localhost:${port}/api-docs`);
}

bootstrap();
