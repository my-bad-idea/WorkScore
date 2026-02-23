import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module.js';

function getPort(): number {
  if (process.env.PORT !== undefined && process.env.PORT !== '') {
    const n = parseInt(process.env.PORT, 10);
    if (!Number.isNaN(n)) return n;
  }
  const candidates = [
    join(process.cwd(), 'config.json'),
    join(process.cwd(), '..', 'config.json'),
    join(__dirname, '..', 'config.json'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const data = JSON.parse(readFileSync(p, 'utf-8')) as { port?: number };
      if (typeof data.port === 'number' && data.port > 0) return data.port;
    } catch {
      // ignore invalid config
    }
  }
  return 3000;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: true,
    credentials: true,
  });

  const port = getPort();
  await app.listen(port);
  console.log(`Backend running at http://localhost:${port}`);
}

bootstrap().catch(console.error);
