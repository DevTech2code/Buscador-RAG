import Joi from 'joi';

export const environmentSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  QDRANT_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  QDRANT_API_KEY: Joi.string().min(16).required(),
  ERP_PRODUCTS_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  ERP_INVENTORY_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  ERP_AUTHORIZATION: Joi.string().min(6).required(),
  ERP_COMPANY_CODE: Joi.string().min(1).max(10).required(),
  ERP_TIMEOUT_MS: Joi.number().integer().min(1000).max(60000).default(25000),
  ERP_MAX_RETRIES: Joi.number().integer().min(0).max(3).default(1),
  ERP_MAX_CONCURRENCY: Joi.number().integer().min(1).max(20).default(2),
  ERP_MAX_QUEUE_SIZE: Joi.number().integer().min(0).max(1000).default(100),
  ERP_CACHE_TTL_SECONDS: Joi.number().integer().min(30).max(3600).default(300),
  ERP_LOCAL_CACHE_TTL_SECONDS: Joi.number()
    .integer()
    .min(5)
    .max(300)
    .default(30),
  ERP_CIRCUIT_FAILURE_THRESHOLD: Joi.number()
    .integer()
    .min(1)
    .max(20)
    .default(3),
  ERP_CIRCUIT_RESET_MS: Joi.number()
    .integer()
    .min(1000)
    .max(300000)
    .default(30000),
}).unknown(true);
