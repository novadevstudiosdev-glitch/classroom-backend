import { webcrypto } from 'crypto';
// Node.js 18 doesn't expose crypto as a global — polyfill for @nestjs/schedule
if (!globalThis.crypto) {
  (globalThis as any).crypto = webcrypto;
}

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);

  app.use(helmet());
  app.use(compression());

  const apiPrefix = process.env.API_PREFIX ?? 'api';
  app.setGlobalPrefix(apiPrefix);

  const extraOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const allowedOrigins = [
    process.env.FRONTEND_URL,
    ...extraOrigins,
  ].filter((o): o is string => !!o);

  app.enableCors({
    origin: (origin, cb) => {
      // Always allow localhost/127.0.0.1 (local dev) and no-origin (Postman/curl)
      if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      cb(new Error(`CORS: origin not allowed — ${origin}`));
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const swaggerEnabled = (process.env.SWAGGER_ENABLED ?? 'true') !== 'false';
  if (swaggerEnabled) {
    const swaggerPassword = process.env.SWAGGER_PASSWORD;
    const swaggerUser = process.env.SWAGGER_USER ?? 'swagger';

    if (swaggerPassword) {
      const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
        const header = req.headers.authorization;
        if (!header || !header.startsWith('Basic ')) {
          res.setHeader('WWW-Authenticate', 'Basic realm="Swagger"');
          return res.status(401).send('Auth required');
        }

        const base64 = header.slice('Basic '.length);
        let decoded = '';
        try {
          decoded = Buffer.from(base64, 'base64').toString('utf8');
        } catch {
          res.setHeader('WWW-Authenticate', 'Basic realm="Swagger"');
          return res.status(401).send('Auth required');
        }

        const idx = decoded.indexOf(':');
        if (idx === -1) {
          res.setHeader('WWW-Authenticate', 'Basic realm="Swagger"');
          return res.status(401).send('Auth required');
        }

        const username = decoded.slice(0, idx);
        const password = decoded.slice(idx + 1);

        if (!safeEqual(username, swaggerUser) || !safeEqual(password, swaggerPassword)) {
          res.setHeader('WWW-Authenticate', 'Basic realm="Swagger"');
          return res.status(401).send('Auth required');
        }

        return next();
      };

      app.use(`/${apiPrefix}/docs`, authMiddleware);
      app.use(`/${apiPrefix}/docs-json`, authMiddleware);
      app.use(`/${apiPrefix}/docs-yaml`, authMiddleware);
    }

    const swaggerConfig = new DocumentBuilder()
      .setTitle('NovaDev API')
      .setDescription('Educational SaaS Platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, swaggerDocument);
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  const host = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${port}`;

  logger.log(`Backend corriendo en ${host}`);
  logger.log(`Swagger disponible en ${host}/${apiPrefix}/docs`);
}

bootstrap();
