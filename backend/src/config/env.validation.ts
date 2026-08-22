import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api/v1'),
  CORS_ORIGIN: Joi.string().default('*'),

  DATABASE_URL: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),

  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(20),

  CHURCHTOOLS_BASE_URL: Joi.string().allow('').optional(),
  CHURCHTOOLS_CLIENT_ID: Joi.string().allow('').optional(),
  CHURCHTOOLS_CLIENT_SECRET: Joi.string().allow('').optional(),
  CHURCHTOOLS_REDIRECT_URI: Joi.string().allow('').optional(),
  CHURCHTOOLS_AUTHORIZATION_URL: Joi.string().allow('').optional(),
  CHURCHTOOLS_TOKEN_URL: Joi.string().allow('').optional(),
  CHURCHTOOLS_PROFILE_URL: Joi.string().allow('').optional(),
  CHURCHTOOLS_SCOPE: Joi.string().default('openid profile groups'),

  WEBAUTHN_RP_ID: Joi.string().default('localhost'),
  WEBAUTHN_RP_NAME: Joi.string().default('Inventarsystem'),
  WEBAUTHN_ORIGIN: Joi.string().default('http://localhost:5173'),

  ADMIN_EMAIL: Joi.string().email().optional(),
  ADMIN_PASSWORD: Joi.string().optional(),
  ADMIN_DISPLAY_NAME: Joi.string().optional(),

  UPLOADS_DIR: Joi.string().default('./uploads'),
  BACKUP_SECRET_KEY: Joi.string().min(32).required(),

  MS_CLIENT_ID: Joi.string().allow('').optional(),
  MS_CLIENT_SECRET: Joi.string().allow('').optional(),
  MS_TENANT_ID: Joi.string().allow('').optional(),
  MS_REDIRECT_URI: Joi.string().allow('').optional(),
});
