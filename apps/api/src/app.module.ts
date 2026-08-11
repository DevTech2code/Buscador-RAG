import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { environmentSchema } from './config/environment.schema';
import { ErpModule } from './erp/erp.module';
import { GuardrailsModule } from './guardrails/guardrails.module';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: environmentSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    RedisModule,
    HealthModule,
    ErpModule,
    GuardrailsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
