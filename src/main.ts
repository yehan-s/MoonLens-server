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
    .setDescription(`
      <h2>GitLab AI 代码审查平台 RESTful API</h2>
      <p>MoonLens 是一个基于 GitLab 的智能代码审查平台，利用 AI 技术提供自动化代码审查服务。</p>
      <h3>主要功能：</h3>
      <ul>
        <li>🔐 完整的用户认证系统（JWT）</li>
        <li>👤 用户管理和资料维护</li>
        <li>🔗 GitLab OAuth 集成</li>
        <li>📁 项目管理</li>
        <li>🤖 AI 代码审查</li>
        <li>📊 审查报告和统计</li>
      </ul>
      <h3>认证方式：</h3>
      <p>所有需要认证的接口都需要在请求头中包含 Bearer Token：</p>
      <code>Authorization: Bearer YOUR_JWT_TOKEN</code>
    `)
    .setVersion('1.0.0')
    .setContact('MoonLens Team', 'https://moonlens.com', 'support@moonlens.com')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: '输入你的 JWT Token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('auth', '用户认证 - 登录、注册、Token管理')
    .addTag('users', '用户管理 - 资料、头像、偏好设置')
    .addTag('projects', '项目管理 - CRUD操作')
    .addTag('gitlab', 'GitLab集成 - OAuth、Webhook')
    .addTag('review', '代码审查 - AI审查、报告')
    .addTag('ai', 'AI服务 - 模型配置、审查策略')
    .addServer('http://localhost:3000', '本地开发环境')
    .addServer('https://api.moonlens.com', '生产环境')
    .build();
    
  const document = SwaggerModule.createDocument(app, config);
  
  // Swagger UI 自定义配置
  const swaggerCustomOptions = {
    explorer: true,
    swaggerOptions: {
      persistAuthorization: true,        // 保持授权信息
      displayRequestDuration: true,      // 显示请求耗时
      docExpansion: 'none',             // 默认折叠所有接口
      filter: true,                      // 启用搜索框
      showExtensions: true,              // 显示扩展信息
      showCommonExtensions: true,        // 显示通用扩展
      tryItOutEnabled: true,             // 启用 Try it out
      displayOperationId: false,         // 不显示 operationId
      defaultModelsExpandDepth: 1,       // 模型默认展开深度
      defaultModelExpandDepth: 1,        // 模型默认展开深度
      tagsSorter: 'alpha',              // 标签按字母排序
      operationsSorter: 'alpha',        // 操作按字母排序
    },
    customCss: `
      .swagger-ui .topbar { 
        background-color: #1a1a2e;
        padding: 10px;
      }
      .swagger-ui .topbar .download-url-wrapper { 
        display: none; 
      }
      .swagger-ui .topbar-wrapper img {
        content: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiM2MzY3ZjEiLz4KPHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyUzYuNDggMjIgMTIgMjJTMjIgMTcuNTIgMjIgMTJTMTcuNTIgMiAxMiAyWiIgZmlsbD0iIzQzNDdkYyIvPgo8cGF0aCBkPSJNOCAxMkw2IDE0TDEyIDIwTDE4IDE0TDE2IDEyTDEyIDE2TDggMTJaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4=');
        height: 40px;
        width: auto;
      }
      .swagger-ui .info .title {
        color: #4347dc;
      }
      .swagger-ui .btn.authorize {
        background-color: #4347dc;
        border-color: #4347dc;
      }
      .swagger-ui .btn.authorize:hover {
        background-color: #6367f1;
        border-color: #6367f1;
      }
      .swagger-ui .btn.authorize svg {
        fill: white;
      }
      .swagger-ui select {
        padding: 5px;
      }
      .swagger-ui .responses-inner h4 {
        font-size: 16px;
      }
    `,
    customSiteTitle: 'MoonLens API 文档',
    customfavIcon: 'https://moonlens.com/favicon.ico',
  };
  
  SwaggerModule.setup('api-docs', app, document, swaggerCustomOptions);
  
  // 提供 JSON 格式的文档
  app.getHttpAdapter().get('/api-docs-json', (req, res) => {
    res.json(document);
  });
  
  // 提供 YAML 格式的文档（可选）
  app.getHttpAdapter().get('/api-docs-yaml', (req, res) => {
    res.type('text/yaml');
    res.send(JSON.stringify(document)); // 实际应该转换为 YAML
  });
  
  await app.listen(port);
  
  console.log(`
  ╔═══════════════════════════════════════════════════════════════╗
  ║                                                               ║
  ║   🚀 MoonLens Server 启动成功!                                ║
  ║                                                               ║
  ║   📍 本地访问:      http://localhost:${port}                      ║
  ║   📚 API 文档:      http://localhost:${port}/api-docs             ║
  ║   📄 JSON 文档:     http://localhost:${port}/api-docs-json        ║
  ║   🔧 当前环境:      ${process.env.NODE_ENV || 'development'}                              ║
  ║                                                               ║
  ║   💡 提示: 使用 Ctrl+C 停止服务器                              ║
  ║                                                               ║
  ╚═══════════════════════════════════════════════════════════════╝
  `);
}

bootstrap();
