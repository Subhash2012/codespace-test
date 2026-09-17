import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { rewardSeed } from '../src/config.js';

const prisma = new PrismaClient();

async function main() {
  const staffPassword = await bcrypt.hash('Staff123!', 10);
  const memberPassword = await bcrypt.hash('Member123!', 10);

  const staffUser = await prisma.user.upsert({
    where: { email: 'staff@beanbalance.com' },
    update: {},
    create: {
      name: 'Demo Staff',
      email: 'staff@beanbalance.com',
      phone: '+91 90000 00001',
      passwordHash: staffPassword,
      role: 'STAFF',
      loyaltyAccount: {
        create: {
          tier: 'BRONZE',
          currentPoints: 0,
          lifetimeEarnedPoints: 0,
        },
      },
    },
  });

  const memberUser = await prisma.user.upsert({
    where: { email: 'member@beanbalance.com' },
    update: {},
    create: {
      name: 'Demo Member',
      email: 'member@beanbalance.com',
      phone: '+91 90000 00002',
      passwordHash: memberPassword,
      role: 'MEMBER',
      loyaltyAccount: {
        create: {
          tier: 'BRONZE',
          currentPoints: 0,
          lifetimeEarnedPoints: 0,
        },
      },
    },
  });

  await prisma.reward.deleteMany();
  await prisma.reward.createMany({
    data: rewardSeed.map((reward) => ({
      name: reward.name,
      description: reward.description,
      pointsCost: reward.pointsCost,
      isActive: true,
    })),
  });

  console.log('Seeded demo accounts and rewards', { staffUser: staffUser.id, memberUser: memberUser.id });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
