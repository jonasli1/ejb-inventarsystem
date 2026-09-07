import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { createValidationPipe } from './common/pipes/validation-pipe.factory';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  const apiPrefix = config.get<string>('apiPrefix')!;
  app.setGlobalPrefix(apiPrefix);

  // The app is only ever reached through our own reverse-proxy chain
  // (Caddy -> nginx (frontend container) -> this process, see
  // docker-compose.yml / caddy/Caddyfile / frontend/nginx-locations.conf,
  // which already forwards X-Forwarded-For). Without `trust proxy`, Express
  // treats every request as coming from that immediate socket peer, so
  // req.ip is the SAME internal container IP for every real-world client -
  // meaning every user of the whole deployment shares one IP-keyed
  // throttle bucket (this is what caused login to 429 in production).
  // `trustProxyHops` counts those hops (Caddy, nginx) so Express resolves
  // the real client IP from X-Forwarded-For instead.
  app.set('trust proxy', config.get<number>('trustProxyHops'));

  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  app.enableCors({
    origin: config.get<string>('corsOrigin'),
    credentials: true,
  });

  app.useGlobalPipes(createValidationPipe());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Inventarsystem API')
    .setDescription(
      'REST API for the Inventarsystem inventory & loan management backend.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  const port = config.get<number>('port')!;
  await app.listen(port);
  Logger.log(
    `Application listening on port ${port} (prefix: /${apiPrefix})`,
    'Bootstrap',
  );
  Logger.log(`Swagger docs available at /${apiPrefix}/docs`, 'Bootstrap');
}
void bootstrap();
