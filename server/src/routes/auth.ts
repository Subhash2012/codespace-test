import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';
import { loginSchema, registerSchema } from '../validation.js';
import { normalizePhone } from '../lib/normalize.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

router.post('/register', async (req, res, next) => {
  try {
    const payload = registerSchema.parse(req.body);
    const normalizedPhone = normalizePhone(payload.phone);
    const email = payload.email.toLowerCase().trim();

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { phone: normalizedPhone }],
      },
    });

    if (existingUser) {
      throw new AppError('Email or phone already registered', 409);
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);
    const user = await prisma.user.create({
      data: {
        name: payload.name.trim(),
        email,
        phone: normalizedPhone,
        passwordHash,
        role: payload.role,
        loyaltyAccount: {
          create: {
            tier: 'BRONZE',
            currentPoints: 0,
            lifetimeEarnedPoints: 0,
          },
        },
      },
      include: { loyaltyAccount: true },
    });

    const token = signToken({ id: user.id, email: user.email, role: user.role as 'MEMBER' | 'STAFF' });
    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        tier: user.loyaltyAccount?.tier ?? 'BRONZE',
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const payload = loginSchema.parse(req.body);
    const identifier = payload.identifier.trim();
    const normalizedPhone = normalizePhone(identifier);

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier.toLowerCase() },
          { phone: normalizedPhone },
        ],
      },
      include: { loyaltyAccount: true },
    });

    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    const isValid = await bcrypt.compare(payload.password, user.passwordHash);
    if (!isValid) {
      throw new AppError('Invalid credentials', 401);
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role as 'MEMBER' | 'STAFF' });
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        tier: user.loyaltyAccount?.tier ?? 'BRONZE',
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { loyaltyAccount: true },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      tier: user.loyaltyAccount?.tier ?? 'BRONZE',
      currentPoints: user.loyaltyAccount?.currentPoints ?? 0,
      lifetimeEarnedPoints: user.loyaltyAccount?.lifetimeEarnedPoints ?? 0,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
