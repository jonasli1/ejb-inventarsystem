import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  code: string;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

// Fallback machine-readable code when an exception doesn't carry a more
// specific one (see AppException in common/exceptions/app.exception.ts).
// Still useful on its own for plain Nest exceptions (NotFoundException etc.)
const DEFAULT_CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR',
};

function codeForStatus(status: number): string {
  return DEFAULT_CODE_BY_STATUS[status] ?? `HTTP_${status}`;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, error, message, code } = this.resolve(exception);

    const body: ErrorBody = {
      statusCode: status,
      code,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(body);
  }

  private resolve(exception: unknown): {
    status: number;
    error: string;
    message: string | string[];
    code: string;
  } {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const status = exception.getStatus();
      if (typeof response === 'string') {
        return {
          status,
          error: exception.name,
          message: response,
          code: codeForStatus(status),
        };
      }
      const body = response as Record<string, unknown>;
      return {
        status,
        error: (body.error as string) ?? exception.name,
        message: (body.message as string | string[]) ?? exception.message,
        code: (body.code as string) ?? codeForStatus(status),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return {
            status: HttpStatus.CONFLICT,
            error: 'Conflict',
            code: 'DUPLICATE_VALUE',
            message: `Ein Eintrag mit diesem Wert (${((exception.meta?.target as string[]) ?? ['Feld']).join(', ')}) existiert bereits.`,
          };
        case 'P2025':
          return {
            status: HttpStatus.NOT_FOUND,
            error: 'Not Found',
            code: 'NOT_FOUND',
            message: 'Die angeforderte Ressource wurde nicht gefunden.',
          };
        case 'P2003':
          return {
            status: HttpStatus.BAD_REQUEST,
            error: 'Bad Request',
            code: 'INVALID_REFERENCE',
            message: 'Die referenzierte Ressource existiert nicht.',
          };
        default:
          return {
            status: HttpStatus.BAD_REQUEST,
            error: 'Bad Request',
            code: 'DATABASE_ERROR',
            message: 'Fehler bei der Datenbankanfrage.',
          };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'Ein unerwarteter Fehler ist aufgetreten.',
    };
  }
}
