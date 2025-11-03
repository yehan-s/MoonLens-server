import { Test, TestingModule } from '@nestjs/testing';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

describe('ReviewController', () => {
  let controller: ReviewController;
  let service: ReviewService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewController],
      providers: [
        {
          provide: ReviewService,
          useValue: {
            list: jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 }),
            get: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    controller = module.get<ReviewController>(ReviewController);
    service = module.get<ReviewService>(ReviewService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('list returns page structure', async () => {
    const res = await controller.list({ projectId: 'p1', mrIid: '1' } as any);
    expect(res).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
  });
});
