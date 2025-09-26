import { ForbiddenException } from '@nestjs/common'
import { GitlabWebhookController } from './webhook.controller'

describe('GitlabWebhookController (unit)', () => {
  const mk = (project?: { id: string; webhookSecret: string | null }) => new GitlabWebhookController(
    {
      project: { findFirst: jest.fn(async () => project) },
      webhookEvent: { create: jest.fn(async (d:any) => ({ id: 'ev1', ...d.data })) },
    } as any,
    { countWebhook: jest.fn() } as any,
    { webhookEvent: jest.fn() } as any,
    { add: jest.fn() } as any,
  )

  it('rejects invalid secret', async () => {
    process.env.GITLAB_WEBHOOK_SECRET = 's'
    const ctrl = mk({ id: 'p1', webhookSecret: 'local' })
    await expect(ctrl.handle({}, 'bad', 'Push Hook' as any)).rejects.toBeInstanceOf(ForbiddenException)
  })
})

