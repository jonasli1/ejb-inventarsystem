import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const apiPrefix = config.get<string>('apiPrefix')!;
  app.setGlobalPrefix(apiPrefix);

  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  app.enableCors({
    origin: config.get<string>('corsOrigin'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Deliberately NOT using enableImplicitConversion: it coerces booleans
      // via `Boolean(value)`, so the query string "false" becomes `true`.
      // DTOs that need type coercion (e.g. pagination page/pageSize) use an
      // explicit @Type()/@Transform() decorator instead.
    }),
  );

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
