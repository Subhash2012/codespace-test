import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireStaff } from '../middleware/auth.js';

const router = Router();

router.get('/outbox', requireAuth, requireStaff, async (_req, res, next) => {
  try {
    const events = await prisma.notificationOutbox.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        eventType: true,
        memberId: true,
        previousTier: true,
        newTier: true,
        payload: true,
        status: true,
        createdAt: true,
      },
    });

    res.json({ events: events.map((event) => ({ ...event, payload: JSON.parse(event.payload) })) });
  } catch (error) {
    next(error);
  }
});

router.get('/api/outbox', requireAuth, requireStaff, async (_req, res, next) => {
  try {
    const events = await prisma.notificationOutbox.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        eventType: true,
        memberId: true,
        previousTier: true,
        newTier: true,
        payload: true,
        status: true,
        createdAt: true,
      },
    });

    res.json({ events: events.map((event) => ({ ...event, payload: JSON.parse(event.payload) })) });
  } catch (error) {
    next(error);
  }
});

router.post('/outbox/process', requireAuth, requireStaff, async (_req, res, next) => {
  try {
    const pending = await prisma.notificationOutbox.findMany({
      where: { status: 'PENDING' },
    });

    for (const event of pending) {
      await prisma.notificationOutbox.update({
        where: { id: event.id },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      });
    }

    res.json({ processed: pending.length });
  } catch (error) {
    next(error);
  }
});

export default router;
