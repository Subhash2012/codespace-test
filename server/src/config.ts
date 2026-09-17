import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'development-secret',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
};

export type TierName = 'BRONZE' | 'SILVER' | 'GOLD';

export const loyaltySettings = {
  tierPoints: {
    BRONZE: 100,
    SILVER: 80,
    GOLD: 60,
  },
};

export function getTierForLifetimePoints(lifetimePoints: number): TierName {
  if (lifetimePoints >= 1500) return 'GOLD';
  if (lifetimePoints >= 500) return 'SILVER';
  return 'BRONZE';
}

export function calculateEarnedPoints(amountPaise: number, tier: TierName): number {
  if (amountPaise <= 0) return 0;
  const rupees = Math.floor(amountPaise / 100);
  const pointsPerRupee = loyaltySettings.tierPoints[tier];
  const raw = Math.floor(rupees / pointsPerRupee);
  return raw > 0 ? raw : 1;
}

export const rewardSeed = [
  { name: 'Free Regular Coffee', description: 'Freshly brewed regular coffee', pointsCost: 100 },
  { name: 'Free Pastry', description: 'Warm bakery pastry', pointsCost: 150 },
  { name: 'Coffee and Pastry Combo', description: 'Coffee with pastry pairing', pointsCost: 250 },
];
