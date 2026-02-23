import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // SPA fallback: 404 + GET + 非 /api 且存在 public/index.html 时返回前端入口
    if (
      status === HttpStatus.NOT_FOUND &&
      request.method === 'GET' &&
      !request.path.startsWith('/api')
    ) {
      const publicIndex = join(process.cwd(), 'public', 'index.html');
      const distPublicIndex = join(__dirname, '..', '..', 'public', 'index.html');
      const pkgRootPublicIndex = join(__dirname, '..', '..', '..', 'public', 'index.html');
      const indexPath = existsSync(publicIndex)
        ? publicIndex
        : existsSync(distPublicIndex)
          ? distPublicIndex
          : existsSync(pkgRootPublicIndex)
            ? pkgRootPublicIndex
            : null;
      if (indexPath) {
        response.status(HttpStatus.OK).sendFile(indexPath);
        return;
      }
    }

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    this.logger.warn(
      `${request.method} ${request.url} ${status}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json(
      typeof message === 'object' && message !== null && 'message' in message
        ? message
        : { message },
    );
  }
}
