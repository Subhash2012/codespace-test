import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { requireAuth, requireSelfOrStaff, requireStaff } from '../middleware/auth.js';
import { memberIdParamSchema, memberSearchSchema, purchaseSchema, redemptionSchema } from '../validation.js';
import { calculateEarnedPoints, getTierForLifetimePoints, type TierName } from '../config.js';
import { normalizePhoneForSearch } from '../lib/normalize.js';
import { addDays, appClock } from '../lib/clock.js';
import { calculateCurrentTierAndProgress, consumeAvailablePoints, maybeCreateTierUpgradeEvent, POINTS_EXPIRY_DAYS } from '../lib/loyalty.js';

const router = Router();

router.get('/', requireAuth, requireStaff, async (req, res, next) => {
  try {
    const query = memberSearchSchema.parse(req.query);
    const search = (query.search || '').trim();
    const where: Record<string, unknown> = {};

    if (search) {
      const normalized = normalizePhoneForSearch(search);
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search.toLowerCase() } },
        { phone: { contains: normalized } },
      ];
    }

    const members = await prisma.user.findMany({
      where,
      include: { loyaltyAccount: true },
    });

    const total = members.length;
    const sorted = [...members].sort((a, b) => {
      const aAccount = a.loyaltyAccount;
      const bAccount = b.loyaltyAccount;
      const direction = query.sortOrder === 'asc' ? 1 : -1;

      switch (query.sortBy) {
        case 'name':
          return a.name.localeCompare(b.name) * direction;
        case 'phone':
          return a.phone.localeCompare(b.phone) * direction;
        case 'tier':
          return (aAccount?.tier ?? 'BRONZE').localeCompare(bAccount?.tier ?? 'BRONZE') * direction;
        case 'currentPoints':
          return ((aAccount?.currentPoints ?? 0) - (bAccount?.currentPoints ?? 0)) * direction;
        case 'lifetimeEarnedPoints':
          return ((aAccount?.lifetimeEarnedPoints ?? 0) - (bAccount?.lifetimeEarnedPoints ?? 0)) * direction;
        default:
          return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction;
      }
    });

    const start = (query.page - 1) * query.pageSize;
    const paginated = sorted.slice(start, start + query.pageSize);
    const data = paginated.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      phone: member.phone,
      role: member.role,
      tier: member.loyaltyAccount?.tier ?? 'BRONZE',
      currentPoints: member.loyaltyAccount?.currentPoints ?? 0,
      lifetimeEarnedPoints: member.loyaltyAccount?.lifetimeEarnedPoints ?? 0,
      createdAt: member.createdAt,
      lastActivity: member.updatedAt,
    }));

    res.json({
      data,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireAuth, requireSelfOrStaff, async (req, res, next) => {
  try {
    const params = memberIdParamSchema.parse(req.params);
    const member = await prisma.user.findUnique({
      where: { id: params.id },
      include: { loyaltyAccount: true },
    });

    if (!member) throw new AppError('Member not found', 404);

    res.json({
      id: member.id,
      name: member.name,
      email: member.email,
      phone: member.phone,
      role: member.role,
      tier: member.loyaltyAccount?.tier ?? 'BRONZE',
      currentPoints: member.loyaltyAccount?.currentPoints ?? 0,
      lifetimeEarnedPoints: member.loyaltyAccount?.lifetimeEarnedPoints ?? 0,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/summary', requireAuth, requireSelfOrStaff, async (req, res, next) => {
  try {
    const params = memberIdParamSchema.parse(req.params);
    const member = await prisma.user.findUnique({
      where: { id: params.id },
      include: { loyaltyAccount: true },
    });

    if (!member || !member.loyaltyAccount) throw new AppError('Member not found', 404);

    const lifetime = member.loyaltyAccount.lifetimeEarnedPoints;
    const progress = calculateCurrentTierAndProgress(lifetime);

    res.json({
      memberId: member.id,
      name: member.name,
      tier: member.loyaltyAccount.tier,
      currentPoints: member.loyaltyAccount.currentPoints,
      lifetimeEarnedPoints: lifetime,
      nextTier: progress.nextTier,
      progress: {
        threshold: progress.threshold,
        current: lifetime,
        remaining: progress.remaining,
        nextTier: progress.nextTier,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/transactions', requireAuth, requireSelfOrStaff, async (req, res, next) => {
  try {
    const params = memberIdParamSchema.parse(req.params);
    const member = await prisma.user.findUnique({ where: { id: params.id } });
    if (!member) throw new AppError('Member not found', 404);

    const [purchases, redemptions, ledger] = await Promise.all([
      prisma.purchase.findMany({
        where: { memberId: params.id },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.redemption.findMany({
        where: { memberId: params.id },
        include: { reward: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.pointLedger.findMany({
        where: { memberId: params.id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json({ purchases, redemptions, ledger });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/purchases', requireAuth, requireSelfOrStaff, async (req, res, next) => {
  try {
    const params = memberIdParamSchema.parse(req.params);
    const body = purchaseSchema.parse(req.body);

    const member = await prisma.user.findUnique({
      where: { id: params.id },
      include: { loyaltyAccount: true },
    });

    if (!member || !member.loyaltyAccount) {
      throw new AppError('Member not found', 404);
    }

    const tierBefore = member.loyaltyAccount.tier as TierName;
    const pointsEarned = calculateEarnedPoints(body.amountPaise, tierBefore);
    const now = appClock.getNow();

    const purchase = await prisma.$transaction(async (tx) => {
      const createdPurchase = await tx.purchase.create({
        data: {
          memberId: params.id,
          amountPaise: body.amountPaise,
          pointsEarned,
          tierUsed: tierBefore,
          receiptNumber: body.receiptNumber || undefined,
        },
      });

      const previousTier = tierBefore;
      const newLifetime = member.loyaltyAccount!.lifetimeEarnedPoints + pointsEarned;
      const newTier = getTierForLifetimePoints(newLifetime);
      const currentPoints = member.loyaltyAccount!.currentPoints;
      const nextBalance = currentPoints + pointsEarned;

      await tx.pointLot.create({
        data: {
          memberId: params.id,
          sourcePurchaseId: createdPurchase.id,
          originalPoints: pointsEarned,
          remainingPoints: pointsEarned,
          earnedAt: now,
          expiresAt: addDays(now, POINTS_EXPIRY_DAYS),
          createdAt: now,
          updatedAt: now,
        },
      });

      await tx.loyaltyAccount.update({
        where: { userId: params.id },
        data: {
          currentPoints: nextBalance,
          lifetimeEarnedPoints: newLifetime,
          tier: newTier,
          updatedAt: now,
        },
      });

      await tx.pointLedger.create({
        data: {
          memberId: params.id,
          type: 'EARN',
          pointsDelta: pointsEarned,
          balanceAfter: nextBalance,
          purchaseId: createdPurchase.id,
          createdAt: now,
        },
      });

      if (newTier !== previousTier) {
        await maybeCreateTierUpgradeEvent(tx, params.id, previousTier, newTier, now);
      }

      return {
        purchase: createdPurchase,
        updatedBalance: nextBalance,
        tier: newTier,
        pointsEarned,
      };
    });

    res.status(201).json({
      message: 'Purchase recorded',
      purchase: purchase.purchase,
      pointsEarned: purchase.pointsEarned,
      updatedBalance: purchase.updatedBalance,
      tier: purchase.tier,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/purchases', requireAuth, requireSelfOrStaff, async (req, res, next) => {
  try {
    const params = memberIdParamSchema.parse(req.params);
    const member = await prisma.user.findUnique({ where: { id: params.id } });
    if (!member) throw new AppError('Member not found', 404);

    const purchases = await prisma.purchase.findMany({
      where: { memberId: params.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ data: purchases });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/redemptions', requireAuth, requireSelfOrStaff, async (req, res, next) => {
  try {
    const params = memberIdParamSchema.parse(req.params);
    const body = redemptionSchema.parse(req.body);
    const member = await prisma.user.findUnique({
      where: { id: params.id },
      include: { loyaltyAccount: true },
    });

    if (!member || !member.loyaltyAccount) {
      throw new AppError('Member not found', 404);
    }

    const reward = await prisma.reward.findUnique({ where: { id: body.rewardId } });
    if (!reward || !reward.isActive) {
      throw new AppError('Reward unavailable', 404);
    }

    const now = appClock.getNow();
    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.loyaltyAccount.findUnique({ where: { userId: params.id } });
      const currentBalance = account?.currentPoints ?? 0;
      const existingLots = await tx.pointLot.findMany({
        where: { memberId: params.id, remainingPoints: { gt: 0 } },
        orderBy: [{ expiresAt: 'asc' }, { earnedAt: 'asc' }],
      });
      const lotBalance = existingLots.reduce((sum, lot) => sum + lot.remainingPoints, 0);
      const effectiveBalance = Math.max(currentBalance, lotBalance);

      if (effectiveBalance < reward.pointsCost) {
        throw new AppError('Insufficient points for redemption', 400);
      }

      if (currentBalance > lotBalance && currentBalance > 0) {
        await tx.pointLot.create({
          data: {
            memberId: params.id,
            originalPoints: currentBalance - lotBalance,
            remainingPoints: currentBalance - lotBalance,
            earnedAt: now,
            expiresAt: addDays(now, POINTS_EXPIRY_DAYS),
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      const createdRedemption = await tx.redemption.create({
        data: {
          memberId: params.id,
          rewardId: reward.id,
          pointsSpent: reward.pointsCost,
        },
      });

      const { consumed } = await consumeAvailablePoints(params.id, reward.pointsCost, tx, now);
      const newBalance = Math.max(0, currentBalance - reward.pointsCost);
      await tx.loyaltyAccount.update({
        where: { userId: params.id },
        data: { currentPoints: newBalance, updatedAt: now },
      });

      await tx.pointLedger.create({
        data: {
          memberId: params.id,
          type: 'REDEEM',
          pointsDelta: -reward.pointsCost,
          balanceAfter: newBalance,
          redemptionId: createdRedemption.id,
          createdAt: now,
        },
      });

      return { redemption: createdRedemption, updatedBalance: newBalance, tier: member.loyaltyAccount!.tier, consumed };
    });

    res.status(201).json({
      message: 'Reward redeemed',
      redemption: result.redemption,
      pointsSpent: result.redemption.pointsSpent,
      updatedBalance: result.updatedBalance,
      tier: result.tier,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/redemptions', requireAuth, requireSelfOrStaff, async (req, res, next) => {
  try {
    const params = memberIdParamSchema.parse(req.params);
    const member = await prisma.user.findUnique({ where: { id: params.id } });
    if (!member) throw new AppError('Member not found', 404);

    const redemptions = await prisma.redemption.findMany({
      where: { memberId: params.id },
      include: { reward: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ data: redemptions });
  } catch (error) {
    next(error);
  }
});

export default router;
