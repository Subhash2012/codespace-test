import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { appClock, addDays } from './clock.js';
import { getTierForLifetimePoints, type TierName } from '../config.js';
import { AppError } from './errors.js';

export const POINTS_EXPIRY_DAYS = 90;

const tierOrder: Record<TierName, number> = {
  BRONZE: 0,
  SILVER: 1,
  GOLD: 2,
  PLATINUM: 3,
};

export async function syncMemberCurrentPoints(
  memberId: string,
  tx: Prisma.TransactionClient,
  now = appClock.getNow(),
) {
  const activeLots = await tx.pointLot.findMany({
    where: {
      memberId,
      remainingPoints: { gt: 0 },
      expiresAt: { gt: now },
    },
    select: { remainingPoints: true },
  });

  const currentPoints = activeLots.reduce((total, entry) => total + entry.remainingPoints, 0);

  await tx.loyaltyAccount.update({
    where: { userId: memberId },
    data: { currentPoints, updatedAt: now },
  });

  return currentPoints;
}

export async function maybeCreateTierUpgradeEvent(
  tx: Prisma.TransactionClient,
  memberId: string,
  previousTier: TierName,
  newTier: TierName,
  now = appClock.getNow(),
) {
  if (tierOrder[newTier] <= tierOrder[previousTier]) {
    return null;
  }

  const dedupeKey = `MEMBER_TIER_UPGRADED:${memberId}:${newTier}`;
  const existingEvent = await tx.notificationOutbox.findUnique({ where: { dedupeKey } });
  if (existingEvent) {
    return existingEvent;
  }

  const member = await tx.user.findUnique({
    where: { id: memberId },
    select: { id: true, name: true, loyaltyAccount: { select: { lifetimeEarnedPoints: true, currentPoints: true } } },
  });

  const payload = {
    eventType: 'MEMBER_TIER_UPGRADED',
    memberId,
    previousTier,
    newTier,
    lifetimeEarnedPoints: member?.loyaltyAccount?.lifetimeEarnedPoints ?? 0,
    currentPoints: member?.loyaltyAccount?.currentPoints ?? 0,
    timestamp: now.toISOString(),
    message: `Congratulations! You have reached ${newTier} tier.`,
  };

  return tx.notificationOutbox.create({
    data: {
      eventType: 'MEMBER_TIER_UPGRADED',
      memberId,
      previousTier,
      newTier,
      payload: JSON.stringify(payload),
      dedupeKey,
      status: 'PENDING',
      createdAt: now,
    },
  });
}

export async function ensureLegacyMemberState(now = appClock.getNow()) {
  const accounts = await prisma.loyaltyAccount.findMany({
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  });

  for (const account of accounts) {
    const memberId = account.userId;
    const user = await prisma.user.findUnique({ where: { id: memberId } });
    if (!user) continue;

    const legacyLotCount = await prisma.pointLot.count({ where: { memberId } });

    if (account.currentPoints > 0 && legacyLotCount === 0) {
      await prisma.pointLot.create({
        data: {
          memberId,
          originalPoints: account.currentPoints,
          remainingPoints: account.currentPoints,
          earnedAt: now,
          expiresAt: addDays(now, POINTS_EXPIRY_DAYS),
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    const tier = account.tier as TierName;
    const matchesPlatinum = account.lifetimeEarnedPoints >= 5000;

    if (matchesPlatinum && tier !== 'PLATINUM') {
      const previousTier = tier as TierName;
      await prisma.$transaction(async (tx) => {
        await tx.loyaltyAccount.update({
          where: { userId: memberId },
          data: { tier: 'PLATINUM', updatedAt: now },
        });

        await maybeCreateTierUpgradeEvent(tx, memberId, previousTier, 'PLATINUM', now);
      });
    }
  }
}

export async function ensureLegacyPointLotsForMember(
  memberId: string,
  tx: Prisma.TransactionClient,
  now = appClock.getNow(),
) {
  const account = await tx.loyaltyAccount.findUnique({ where: { userId: memberId } });
  if (!account || account.currentPoints <= 0) return [];

  const existingLots = await tx.pointLot.findMany({ where: { memberId, remainingPoints: { gt: 0 } } });
  if (existingLots.length > 0) return existingLots;

  const legacyLot = await tx.pointLot.create({
    data: {
      memberId,
      originalPoints: account.currentPoints,
      remainingPoints: account.currentPoints,
      earnedAt: now,
      expiresAt: addDays(now, POINTS_EXPIRY_DAYS),
      createdAt: now,
      updatedAt: now,
    },
  });

  return [legacyLot];
}

export async function runPointExpirationJob(now = appClock.getNow(), tx: Prisma.TransactionClient = prisma) {
  const lots = await tx.pointLot.findMany({
    where: {
      remainingPoints: { gt: 0 },
      expiresAt: { lte: now },
    },
    orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
  });

  const byMember = new Map<string, number>();

  for (const lot of lots) {
    const expiredAmount = lot.remainingPoints;
    byMember.set(lot.memberId, (byMember.get(lot.memberId) ?? 0) + expiredAmount);
    await tx.pointLot.update({
      where: { id: lot.id },
      data: { remainingPoints: 0, updatedAt: now },
    });
  }

  const affectedMembers: Array<{ memberId: string; expiredPoints: number; newBalance: number; }> = [];

  for (const [memberId, expiredPoints] of byMember.entries()) {
    const account = await tx.loyaltyAccount.findUnique({ where: { userId: memberId } });
    if (!account) continue;

    const newBalance = Math.max(0, account.currentPoints - expiredPoints);
    await tx.loyaltyAccount.update({
      where: { userId: memberId },
      data: { currentPoints: newBalance, updatedAt: now },
    });

    await tx.pointLedger.create({
      data: {
        memberId,
        type: 'EXPIRE',
        pointsDelta: -expiredPoints,
        balanceAfter: newBalance,
        createdAt: now,
      },
    });

    affectedMembers.push({ memberId, expiredPoints, newBalance });
  }

  return {
    expiredPoints: affectedMembers.reduce((total, entry) => total + entry.expiredPoints, 0),
    affectedMembers,
  };
}

export async function consumeAvailablePoints(
  memberId: string,
  pointsNeeded: number,
  tx: Prisma.TransactionClient,
  now = appClock.getNow(),
) {
  if (pointsNeeded <= 0) {
    return { consumed: 0, remaining: 0 };
  }

  let lots = await tx.pointLot.findMany({
    where: {
      memberId,
      remainingPoints: { gt: 0 },
      expiresAt: { gt: now },
    },
    orderBy: [{ expiresAt: 'asc' }, { earnedAt: 'asc' }],
  });

  const account = await tx.loyaltyAccount.findUnique({ where: { userId: memberId } });
  const lotBalance = lots.reduce((sum, lot) => sum + lot.remainingPoints, 0);
  if (account && account.currentPoints > lotBalance && account.currentPoints > 0) {
    const legacyLot = await tx.pointLot.create({
      data: {
        memberId,
        originalPoints: account.currentPoints - lotBalance,
        remainingPoints: account.currentPoints - lotBalance,
        earnedAt: now,
        expiresAt: addDays(now, POINTS_EXPIRY_DAYS),
        createdAt: now,
        updatedAt: now,
      },
    });
    lots = [...lots, legacyLot];
  }

  if (lots.length === 0) {
    throw new AppError('Insufficient points', 400);
  }

  let remainingToSpend = pointsNeeded;
  const updatedLots: Array<{ id: string; consumed: number }> = [];

  for (const lot of lots) {
    if (remainingToSpend <= 0) break;
    const toConsume = Math.min(lot.remainingPoints, remainingToSpend);
    if (toConsume <= 0) continue;

    updatedLots.push({ id: lot.id, consumed: toConsume });
    remainingToSpend -= toConsume;
  }

  if (remainingToSpend > 0) {
    throw new AppError('Insufficient points', 400);
  }

  for (const lot of updatedLots) {
    const sourceLot = lots.find((candidate) => candidate.id === lot.id);
    if (!sourceLot) continue;
    const updatedRemaining = Math.max(0, sourceLot.remainingPoints - lot.consumed);
    await tx.pointLot.update({
      where: { id: lot.id },
      data: { remainingPoints: updatedRemaining, updatedAt: now },
    });
  }

  return { consumed: pointsNeeded, remaining: 0 };
}

export function getNextTierThreshold(tier: TierName) {
  if (tier === 'BRONZE') return { threshold: 500, nextTier: 'SILVER' as const };
  if (tier === 'SILVER') return { threshold: 1500, nextTier: 'GOLD' as const };
  if (tier === 'GOLD') return { threshold: 5000, nextTier: 'PLATINUM' as const };
  return { threshold: 5000, nextTier: null };
}

export function calculateCurrentTierAndProgress(lifetimeEarned: number) {
  const tier = getTierForLifetimePoints(lifetimeEarned);
  if (tier === 'BRONZE') {
    return { tier, threshold: 500, nextTier: 'SILVER', remaining: Math.max(0, 500 - lifetimeEarned) };
  }
  if (tier === 'SILVER') {
    return { tier, threshold: 1500, nextTier: 'GOLD', remaining: Math.max(0, 1500 - lifetimeEarned) };
  }
  if (tier === 'GOLD') {
    return { tier, threshold: 5000, nextTier: 'PLATINUM', remaining: Math.max(0, 5000 - lifetimeEarned) };
  }
  return { tier, threshold: 5000, nextTier: null, remaining: 0 };
}
