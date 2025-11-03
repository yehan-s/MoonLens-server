import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import type { AiProvider, GenerateOptions } from './ai-provider.interface'

@Injectable()
export class OpenAIProvider implements AiProvider {
  name = 'openai'
  constructor(private readonly cfg: ConfigService, private readonly http: HttpService) {}

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const apiKey = this.cfg.get<string>('AI_API_KEY')
    const apiUrl = this.cfg.get<string>('AI_API_URL', 'https://api.openai.com/v1/chat/completions')
    const model = options?.model || this.cfg.get<string>('AI_MODEL', 'gpt-4o-mini')
    const temperature = options?.temperature ?? 0.3
    const resp = await firstValueFrom(this.http.post(apiUrl, {
      model,
      messages: [
        { role: 'system', content: '你是一个专业的代码审查专家，专注于代码质量和安全性分析。' },
        { role: 'user', content: prompt },
      ],
      temperature,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    }))
    const data: any = resp.data
    // 兼容：若返回 choices 结构则取 content，否则尝试 data.content
    const content = data?.choices?.[0]?.message?.content || data?.content || ''
    return String(content)
  }
}

