import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { appClock } from '../lib/clock.js';
import { runPointExpirationJob } from '../lib/loyalty.js';
import { AppError } from '../lib/errors.js';

const router = Router();

const clockSetSchema = z.object({
  now: z.string().datetime().optional(),
  advanceDays: z.coerce.number().int().optional(),
});

router.get('/clock', (_req, res) => {
  res.json({ now: appClock.getNow().toISOString() });
});

router.post('/clock', async (req, res, next) => {
  try {
    const payload = clockSetSchema.parse(req.body ?? {});

    if (payload.now) {
      appClock.setNow(new Date(payload.now));
    } else if (typeof payload.advanceDays === 'number') {
      appClock.advanceDays(payload.advanceDays);
    } else {
      throw new AppError('Provide now or advanceDays', 400);
    }

    const result = await prisma.$transaction(async (tx) => runPointExpirationJob(appClock.getNow(), tx));

    res.json({
      now: appClock.getNow().toISOString(),
      expiredPoints: result.expiredPoints,
      affectedMembers: result.affectedMembers.length,
      members: result.affectedMembers,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/clock/reset', async (_req, res) => {
  appClock.reset();
  const result = await prisma.$transaction(async (tx) => runPointExpirationJob(appClock.getNow(), tx));
  res.json({ now: appClock.getNow().toISOString(), expiredPoints: result.expiredPoints, affectedMembers: result.affectedMembers.length });
});

export default router;
