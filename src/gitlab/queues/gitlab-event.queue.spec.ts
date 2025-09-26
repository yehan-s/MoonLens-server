import { GitlabEventProcessor } from './gitlab-event.queue'

describe('GitlabEventProcessor', () => {
  it('marks event processed', async () => {
    const prisma = {
      webhookEvent: {
        findUnique: jest.fn(async () => ({ id: 'ev1', eventType: 'push' })),
        update: jest.fn(async () => ({})),
      }
    }
    const proc = new GitlabEventProcessor(prisma as any)
    await proc.handle({ data: { eventId: 'ev1' } } as any)
    expect(prisma.webhookEvent.update).toHaveBeenCalled()
  })
})

