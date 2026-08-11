import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch((error: unknown) => {
  const details = error instanceof Error ? error.stack : String(error);

  Logger.error('The API failed to start', details, 'Bootstrap');
  process.exitCode = 1;
});
