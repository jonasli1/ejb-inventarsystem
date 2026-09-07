import { ValidationPipe } from '@nestjs/common';
import { ValidationFailedException } from '../exceptions/app.exception';
import { translateValidationErrors } from './validation-error.util';

/**
 * Shared ValidationPipe config for main.ts and the e2e test bootstrap, so
 * the two never drift apart. Translates class-validator's default (English)
 * constraint messages into German instead of hand-writing a `message` on
 * every decorator across every DTO.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    // Deliberately NOT using enableImplicitConversion: it coerces booleans
    // via `Boolean(value)`, so the query string "false" becomes `true`.
    // DTOs that need type coercion (e.g. pagination page/pageSize) use an
    // explicit @Type()/@Transform() decorator instead.
    exceptionFactory: (errors) =>
      new ValidationFailedException(translateValidationErrors(errors)),
  });
}
