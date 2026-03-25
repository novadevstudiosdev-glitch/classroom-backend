import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException ? exception.getResponse() : null;

    // Extraer el mensaje: puede ser string o array (validation errors)
    let message: string | string[];
    let data: unknown = null;
    if (isHttpException) {
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const body = exceptionResponse as Record<string, any>;

        // Terminus HealthCheck (503): preserve details in `data` to help debugging/monitoring
        const isHealthCheckBody =
          typeof body.status === 'string' &&
          (body.info !== undefined || body.error !== undefined || body.details !== undefined);

        if (isHealthCheckBody) {
          message = 'Uno o más servicios con problemas.';
          data = body;
        } else {
          message = body.message ?? exception.message;
        }
      } else {
        message = exception.message;
      }
    } else {
      message = 'Error interno del servidor.';
    }

    // Loguear errores 5xx (errores nuestros, no del cliente)
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(`${request.method} ${request.url} -> ${status}`, stack ?? String(exception));
    }

    response.status(status).json({
      statusCode: status,
      message,
      data,
    });
  }
}
