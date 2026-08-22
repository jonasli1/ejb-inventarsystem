export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  database: {
    url: process.env.DATABASE_URL,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '20', 10),
  },

  churchtools: {
    baseUrl: process.env.CHURCHTOOLS_BASE_URL ?? '',
    clientId: process.env.CHURCHTOOLS_CLIENT_ID ?? '',
    clientSecret: process.env.CHURCHTOOLS_CLIENT_SECRET ?? '',
    redirectUri: process.env.CHURCHTOOLS_REDIRECT_URI ?? '',
    authorizationUrl: process.env.CHURCHTOOLS_AUTHORIZATION_URL ?? '',
    tokenUrl: process.env.CHURCHTOOLS_TOKEN_URL ?? '',
    profileUrl: process.env.CHURCHTOOLS_PROFILE_URL ?? '',
    scope: process.env.CHURCHTOOLS_SCOPE ?? 'openid profile groups',
  },

  webauthn: {
    rpId: process.env.WEBAUTHN_RP_ID ?? 'localhost',
    rpName: process.env.WEBAUTHN_RP_NAME ?? 'Inventarsystem',
    origin: process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:5173',
  },

  // Base URL used to build links in transactional emails (password reset).
  // Reuses WEBAUTHN_ORIGIN rather than introducing a second variable: both
  // already have to equal the exact origin the frontend is served from.
  frontendUrl: process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:5173',

  admin: {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    displayName: process.env.ADMIN_DISPLAY_NAME ?? 'System Administrator',
  },

  uploadsDir: process.env.UPLOADS_DIR ?? './uploads',

  backup: {
    secretKey: process.env.BACKUP_SECRET_KEY,
  },

  microsoft: {
    clientId: process.env.MS_CLIENT_ID ?? '',
    clientSecret: process.env.MS_CLIENT_SECRET ?? '',
    tenantId: process.env.MS_TENANT_ID ?? 'common',
    redirectUri: process.env.MS_REDIRECT_URI ?? '',
  },
});
