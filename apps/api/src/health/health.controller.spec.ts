import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports that the API is healthy', () => {
    const controller = new HealthController();

    expect(controller.check()).toMatchObject({
      service: 'api',
      status: 'ok',
    });
  });
});
