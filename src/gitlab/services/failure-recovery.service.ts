import { Injectable, Logger } from '@nestjs/common';

type CircuitState = 'closed' | 'open' | 'half';

interface Circuit {
  state: CircuitState;
  failures: number;
  openedAt?: number;
  halfProbeAt?: number;
}

export interface BreakerOptions {
  key: string; // 断路器键（如 host 或 host+path 模式）
  failureThreshold?: number; // 连续失败次数阈值，默认 5
  coolDownMs?: number; // 打开后冷却时间，默认 30s
  halfOpenProbeMs?: number; // 半开探测间隔，默认 5s
}

@Injectable()
export class FailureRecoveryService {
  private readonly logger = new Logger(FailureRecoveryService.name);
  private readonly circuits = new Map<string, Circuit>();

  private getOrInit(key: string): Circuit {
    let c = this.circuits.get(key);
    if (!c) {
      c = { state: 'closed', failures: 0 };
      this.circuits.set(key, c);
    }
    return c;
  }

  beforeRequest(opts: BreakerOptions): { allow: boolean; reason?: string } {
    const cfg = this.defaults(opts);
    const c = this.getOrInit(cfg.key);
    const now = Date.now();

    if (c.state === 'open') {
      if (c.openedAt && now - c.openedAt >= cfg.coolDownMs) {
        // 进入半开状态，允许少量探测
        c.state = 'half';
        c.halfProbeAt = now;
        this.logger.warn(`circuit half-open: ${cfg.key}`);
        return { allow: true };
      }
      return { allow: false, reason: 'circuit_open' };
    }

    if (c.state === 'half') {
      if (!c.halfProbeAt || now - c.halfProbeAt >= (cfg.halfOpenProbeMs ?? 5000)) {
        c.halfProbeAt = now;
        return { allow: true };
      }
      return { allow: false, reason: 'half_wait' };
    }

    return { allow: true };
  }

  afterSuccess(opts: BreakerOptions) {
    const cfg = this.defaults(opts);
    const c = this.getOrInit(cfg.key);
    if (c.state !== 'closed') {
      this.logger.log(`circuit close: ${cfg.key}`);
    }
    c.state = 'closed';
    c.failures = 0;
    c.openedAt = undefined;
    c.halfProbeAt = undefined;
  }

  afterFailure(opts: BreakerOptions) {
    const cfg = this.defaults(opts);
    const c = this.getOrInit(cfg.key);
    c.failures += 1;
    if (c.state === 'half') {
      // 半开失败，重新打开
      c.state = 'open';
      c.openedAt = Date.now();
      this.logger.error(`circuit re-open after half: ${cfg.key}`);
      return;
    }
    if (c.failures >= cfg.failureThreshold) {
      c.state = 'open';
      c.openedAt = Date.now();
      this.logger.error(`circuit open: ${cfg.key} (failures=${c.failures})`);
    }
  }

  manualOpen(key: string) {
    const c = this.getOrInit(key);
    c.state = 'open';
    c.openedAt = Date.now();
  }

  manualClose(key: string) {
    const c = this.getOrInit(key);
    c.state = 'closed';
    c.failures = 0;
    c.openedAt = undefined;
    c.halfProbeAt = undefined;
  }

  getState(key: string): CircuitState {
    return this.getOrInit(key).state;
  }

  private defaults(opts: BreakerOptions): Required<BreakerOptions> {
    return {
      key: opts.key,
      failureThreshold: opts.failureThreshold ?? 5,
      coolDownMs: opts.coolDownMs ?? 30000,
      halfOpenProbeMs: opts.halfOpenProbeMs ?? 5000,
    };
  }
}

