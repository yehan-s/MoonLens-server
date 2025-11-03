export interface GenerateOptions {
  model?: string
  temperature?: number
}

export interface AiProvider {
  name: string
  generate(prompt: string, options?: GenerateOptions): Promise<string>
}

