import { GitlabApiClientService } from './gitlab-api-client.service'

describe('GitlabApiClientService.doFetch', () => {
  const mk = () => new GitlabApiClientService(
    { get: (_k: string, def: any) => def } as any,
    { observeApi: jest.fn() } as any,
    {
      beforeRequest: () => ({ allow: true }),
      afterSuccess: jest.fn(),
      afterFailure: jest.fn(),
    } as any,
  )

  it('retries on 429 then succeeds', async () => {
    const svc = mk()
    let called = 0
    // @ts-ignore
    global.fetch = jest.fn(async () => {
      called++
      if (called === 1) {
        return { ok: false, status: 429, headers: { get: () => null }, statusText: 'Too Many', text: async () => '' } as any
      }
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) } as any
    })
    const res = await (svc as any).doFetch('http://x/api', { retry: { retries: 1, baseDelayMs: 0 } } as any)
    expect(res.ok).toBe(true)
    expect(called).toBe(2)
  })
})

