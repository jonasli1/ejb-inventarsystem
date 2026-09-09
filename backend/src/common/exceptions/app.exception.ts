import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * These extend Nest's built-in HttpException subclasses (not just
 * HttpException directly) so that `instanceof NotFoundException` /
 * `ForbiddenException` / etc. checks elsewhere in the codebase and in tests
 * keep working unchanged. They add a stable, machine-readable `code`
 * alongside the (German) human-readable `message` - `AllExceptionsFilter`
 * reads `code` off the exception response body, falling back to a
 * status-derived generic code for plain Nest exceptions.
 */

export class AppBadRequestException extends BadRequestException {
  constructor(message: string | string[], code: string) {
    super({ message, code });
  }
}

export class AppConflictException extends ConflictException {
  constructor(message: string, code: string) {
    super({ message, code });
  }
}

export class AppForbiddenException extends ForbiddenException {
  constructor(message: string, code: string) {
    super({ message, code });
  }
}

export class AppNotFoundException extends NotFoundException {
  constructor(message: string, code = 'NOT_FOUND') {
    super({ message, code });
  }
}

export class AppUnauthorizedException extends UnauthorizedException {
  constructor(message: string, code: string) {
    super({ message, code });
  }
}

export class AppInternalServerErrorException extends InternalServerErrorException {
  constructor(message: string, code: string) {
    super({ message, code });
  }
}

/** Thrown by the global ValidationPipe's exceptionFactory (see validation-pipe.factory.ts). */
export class ValidationFailedException extends AppBadRequestException {
  constructor(messages: string[]) {
    super(messages, 'VALIDATION_ERROR');
  }
}
