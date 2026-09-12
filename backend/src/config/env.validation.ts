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
  // 20/min was tuned for one request at a time, not a real page load: a
  // single list view fires the list itself, several reference-data lookups
  // (locations/categories/organizations/articles for filters), and one
  // thumbnail request per visible row - routinely 30-60+ requests within a
  // few seconds for one legitimate user, before counting a second person on
  // the same connection. 300/min covers that comfortably while still
  // blocking a scripted flood; login has its own separate, tighter limit
  // below and is unaffected by this one (verified: exhausting this bucket
  // does not throttle a login attempt right after).
  THROTTLE_LIMIT: Joi.number().default(300),
  THROTTLE_AUTH_LIMIT: Joi.number().default(10),
  THROTTLE_AUTH_TTL: Joi.number().default(60000),

  // Number of reverse-proxy hops in front of this process (see main.ts) -
  // this deployment always runs behind Caddy -> nginx (frontend container).
  TRUST_PROXY_HOPS: Joi.number().default(2),

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
