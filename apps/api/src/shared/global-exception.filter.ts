import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      this.logger.error(exception);
    } else if (!isHttp) {
      this.logger.warn(String(exception));
    }

    const message = isHttp
      ? exception.message
      : status >= 500
        ? 'Internal error'
        : safeMessage(exception, this.logger);
    response.code(status).send({
      code: status,
      status: 'fail',
      data: null,
      message,
    });
  }
}

function safeMessage(err: unknown, logger: Logger): string {
  try {
    const msg = err instanceof Error ? err.message : String(err);
    return msg || 'Request failed';
  } catch {
    logger.warn('failed to serialize error message');
    return 'Request failed';
  }
}

export const appExceptionFilterFactory = () => new AllExceptionsFilter();
