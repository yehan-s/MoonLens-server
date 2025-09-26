import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';

@Injectable()
export class TOTPService {
  constructor() {
    // 允许通过环境变量配置步长/位数
    const step = parseInt(process.env.TOTP_STEP || '30', 10);
    const digits = parseInt(process.env.TOTP_DIGITS || '6', 10);
    authenticator.options = { step, digits } as any;
  }

  generateSecret(email: string): { secret: string; otpauthUrl: string } {
    const issuer = process.env.TOTP_ISSUER || 'MoonLens';
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(email, issuer, secret);
    return { secret, otpauthUrl };
  }

  verifyCode(secret: string, code: string): boolean {
    return authenticator.check(code, secret);
  }
}

