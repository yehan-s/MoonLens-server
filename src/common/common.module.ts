import { Module, Global } from '@nestjs/common';
import { PrismaService } from './services/prisma.service';
import { AuditLogService } from './services/audit-log.service';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

@Global()
@Module({
  imports: [
    WinstonModule.forRoot({
      level: process.env.LOG_LEVEL || 'info',
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.ms(),
            winston.format.json(),
          ),
        }),
      ],
    }),
  ],
  providers: [PrismaService, AuditLogService],
  exports: [PrismaService, AuditLogService],
})
export class CommonModule {}
