import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import { rewardSchema } from '../validation.js';

const router = Router();
const rewardIdParamSchema = z.object({ id: z.string().trim().min(1) });

router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const rewards = await prisma.reward.findMany({
      where: { isActive: true },
      orderBy: { pointsCost: 'asc' },
    });
    res.json({ data: rewards });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, requireStaff, async (req, res, next) => {
  try {
    const payload = rewardSchema.parse(req.body);
    const reward = await prisma.reward.create({ data: payload });
    res.status(201).json({ reward });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireAuth, requireStaff, async (req, res, next) => {
  try {
    const params = rewardIdParamSchema.parse(req.params);
    const payload = rewardSchema.parse(req.body);
    const reward = await prisma.reward.update({
      where: { id: params.id },
      data: payload,
    });
    res.json({ reward });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireAuth, requireStaff, async (req, res, next) => {
  try {
    const params = rewardIdParamSchema.parse(req.params);
    const reward = await prisma.reward.findUnique({ where: { id: params.id } });
    if (!reward) throw new AppError('Reward not found', 404);
    await prisma.reward.update({ where: { id: params.id }, data: { isActive: false } });
    res.json({ message: 'Reward deactivated' });
  } catch (error) {
    next(error);
  }
});

export default router;
