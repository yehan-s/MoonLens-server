import { HttpException, HttpStatus } from '@nestjs/common'

export function toHttpException(e: any, fallback: HttpStatus = HttpStatus.BAD_GATEWAY): HttpException {
  // Abort/timeout
  if (e?.name === 'AbortError') {
    return new HttpException('上游接口超时', HttpStatus.GATEWAY_TIMEOUT)
  }
  // 解析类似 "HTTP 404 Not Found: ..." 的错误
  const msg: string = String(e?.message || '')
  const m = msg.match(/HTTP\s+(\d{3})\s+/i)
  if (m) {
    const code = Number(m[1])
    const status = code >= 400 && code <= 599 ? code : fallback
    return new HttpException(msg, status)
  }
  return new HttpException(msg || '上游接口错误', fallback)
}

