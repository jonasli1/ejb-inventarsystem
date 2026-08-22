import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, error, message } = this.resolve(exception);

    const body: ErrorBody = {
      statusCode: status,
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
  } {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const status = exception.getStatus();
      if (typeof response === 'string') {
        return { status, error: exception.name, message: response };
      }
      const body = response as Record<string, unknown>;
      return {
        status,
        error: (body.error as string) ?? exception.name,
        message: (body.message as string | string[]) ?? exception.message,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return {
            status: HttpStatus.CONFLICT,
            error: 'Conflict',
            message: `A record with this ${((exception.meta?.target as string[]) ?? ['value']).join(', ')} already exists.`,
          };
        case 'P2025':
          return {
            status: HttpStatus.NOT_FOUND,
            error: 'Not Found',
            message: 'The requested resource was not found.',
          };
        case 'P2003':
          return {
            status: HttpStatus.BAD_REQUEST,
            error: 'Bad Request',
            message: 'Referenced resource does not exist.',
          };
        default:
          return {
            status: HttpStatus.BAD_REQUEST,
            error: 'Bad Request',
            message: 'Database request error.',
          };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred.',
    };
  }
}
