import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AiProvider } from './ai-provider.interface'
import { OpenAIProvider } from './openai.provider'
import { MoonshotProvider } from './moonshot.provider'

@Injectable()
export class AiProviderFactory {
  constructor(
    private readonly cfg: ConfigService,
    private readonly openai: OpenAIProvider,
    private readonly moonshot: MoonshotProvider,
  ) {}

  get(): AiProvider {
    const p = (this.cfg.get<string>('AI_PROVIDER') || 'openai').toLowerCase()
    if (p.includes('moon') || p === 'kimi' || p === 'moonshot') return this.moonshot
    return this.openai
  }
}

