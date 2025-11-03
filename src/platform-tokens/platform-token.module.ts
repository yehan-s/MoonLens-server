import { Module } from '@nestjs/common';
import { PlatformTokenService } from './platform-token.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PlatformTokenService],
  exports: [PlatformTokenService],
})
export class PlatformTokenModule {}
