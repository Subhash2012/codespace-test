import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { config } from './config.js';
import authRouter from './routes/auth.js';
import membersRouter from './routes/members.js';
import rewardsRouter from './routes/rewards.js';
import clockRouter from './routes/clock.js';
import outboxRouter from './routes/outbox.js';
import { serializeError } from './lib/errors.js';
import { appClock } from './lib/clock.js';

export function createApp() {
  const app = express();

  app.use(cors({
    origin: [config.clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'BeanBalance API', timestamp: appClock.getNow().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/members', membersRouter);
  app.use('/api/rewards', rewardsRouter);
  app.use('/api', clockRouter);
  app.use('/api', outboxRouter);
  app.use('/', clockRouter);
  app.use('/', outboxRouter);

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found', path: req.originalUrl });
  });

  app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    console.error('[api-error]', {
      method: req.method,
      url: req.originalUrl,
      error: error instanceof Error ? error.message : error,
    });

    const payload = serializeError(error);
    res.status(payload.statusCode).json({
      error: payload.message,
      ...(payload.details ? { details: payload.details } : {}),
    });
    next();
  });

  return app;
}

const app = createApp();

if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    console.log(`BeanBalance API listening on http://localhost:${config.port}`);
  });
}

export default app;
