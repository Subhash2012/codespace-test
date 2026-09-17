import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/index.js';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const app = createApp();

beforeAll(async () => {
  await prisma.pointLedger.deleteMany();
  await prisma.redemption.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.reward.deleteMany();
  await prisma.loyaltyAccount.deleteMany();
  await prisma.user.deleteMany();

  const staffPassword = await bcrypt.hash('Staff123!', 10);
  const memberPassword = await bcrypt.hash('Member123!', 10);

  await prisma.user.create({
    data: {
      name: 'Demo Staff',
      email: 'staff@beanbalance.com',
      phone: '9000000001',
      passwordHash: staffPassword,
      role: 'STAFF',
      loyaltyAccount: {
        create: { tier: 'BRONZE', currentPoints: 0, lifetimeEarnedPoints: 0 },
      },
    },
  });

  await prisma.user.create({
    data: {
      name: 'Demo Member',
      email: 'member@beanbalance.com',
      phone: '9000000002',
      passwordHash: memberPassword,
      role: 'MEMBER',
      loyaltyAccount: {
        create: { tier: 'BRONZE', currentPoints: 0, lifetimeEarnedPoints: 0 },
      },
    },
  });

  await prisma.reward.createMany({
    data: [
      { name: 'Free Regular Coffee', description: 'Freshly brewed regular coffee', pointsCost: 100, isActive: true },
      { name: 'Free Pastry', description: 'Warm bakery pastry', pointsCost: 150, isActive: true },
      { name: 'Coffee and Pastry Combo', description: 'Coffee with pastry pairing', pointsCost: 250, isActive: true },
    ],
  });
});

describe('BeanBalance API', () => {
  it('registers a member and hashes password', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Jane Member',
        email: 'jane@example.com',
        phone: '+91 98765 43210',
        password: 'Pass1234!',
        role: 'MEMBER',
      });

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe('jane@example.com');
    const user = await prisma.user.findUnique({ where: { email: 'jane@example.com' } });
    expect(user?.passwordHash).not.toBe('Pass1234!');
    expect(user?.passwordHash).not.toBe('');
  });

  it('logs in with a valid email', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'member@beanbalance.com', password: 'Member123!' });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
  });

  it('rejects duplicate email or phone', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Duplicate Member',
        email: 'member@beanbalance.com',
        phone: '9000000009',
        password: 'Pass1234!',
        role: 'MEMBER',
      });

    expect(response.status).toBe(409);
  });

  it('awards Bronze purchase points using tier before purchase', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'member@beanbalance.com', password: 'Member123!' });

    const user = await prisma.user.findUnique({ where: { email: 'member@beanbalance.com' }, include: { loyaltyAccount: true } });
    const response = await request(app)
      .post(`/api/members/${user!.id}/purchases`)
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ amountPaise: 25000, receiptNumber: 'R-101' });

    expect(response.status).toBe(201);
    expect(response.body.pointsEarned).toBe(2);
    expect(response.body.updatedBalance).toBe(2);
  });

  it('handles silver and gold tier calculations', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'staff@beanbalance.com', password: 'Staff123!' });

    const member = await prisma.user.create({
      data: {
        name: 'Silver Tier User',
        email: 'silver@example.com',
        phone: '9000000101',
        passwordHash: await bcrypt.hash('Pass1234!', 10),
        role: 'MEMBER',
        loyaltyAccount: {
          create: { tier: 'SILVER', currentPoints: 0, lifetimeEarnedPoints: 500 },
        },
      },
    });

    const silver = await request(app)
      .post(`/api/members/${member.id}/purchases`)
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ amountPaise: 8000, receiptNumber: 'S-001' });
    expect(silver.status).toBe(201);
    expect(silver.body.pointsEarned).toBe(1);

    const goldMember = await prisma.user.create({
      data: {
        name: 'Gold Tier User',
        email: 'gold@example.com',
        phone: '9000000102',
        passwordHash: await bcrypt.hash('Pass1234!', 10),
        role: 'MEMBER',
        loyaltyAccount: {
          create: { tier: 'GOLD', currentPoints: 0, lifetimeEarnedPoints: 1500 },
        },
      },
    });

    const gold = await request(app)
      .post(`/api/members/${goldMember.id}/purchases`)
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ amountPaise: 6000, receiptNumber: 'G-001' });

    expect(gold.status).toBe(201);
    expect(gold.body.pointsEarned).toBe(1);
  });

  it('redeems an available reward and creates ledger records', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'member@beanbalance.com', password: 'Member123!' });

    const user = await prisma.user.findUnique({ where: { email: 'member@beanbalance.com' }, include: { loyaltyAccount: true } });
    await prisma.loyaltyAccount.update({
      where: { userId: user!.id },
      data: { currentPoints: 200 },
    });

    const rewards = await prisma.reward.findMany();
    const response = await request(app)
      .post(`/api/members/${user!.id}/redemptions`)
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ rewardId: rewards[0].id });

    expect(response.status).toBe(201);
    expect(response.body.updatedBalance).toBe(100);
    const ledger = await prisma.pointLedger.findFirst({ where: { memberId: user!.id, type: 'REDEEM' } });
    expect(ledger).toBeTruthy();
  });

  it('rejects redemption when points are insufficient', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'member@beanbalance.com', password: 'Member123!' });

    const user = await prisma.user.findUnique({ where: { email: 'member@beanbalance.com' }, include: { loyaltyAccount: true } });
    await prisma.loyaltyAccount.update({ where: { userId: user!.id }, data: { currentPoints: 0 } });

    const rewards = await prisma.reward.findMany();
    const response = await request(app)
      .post(`/api/members/${user!.id}/redemptions`)
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ rewardId: rewards[0].id });

    expect(response.status).toBe(400);
  });

  it('searches, paginates, and sorts members for staff', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'staff@beanbalance.com', password: 'Staff123!' });

    const response = await request(app)
      .get('/api/members?search=9000000002&page=1&pageSize=10&sortBy=phone&sortOrder=desc')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBeGreaterThan(0);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('requires authentication and staff access for protected routes', async () => {
    const unauth = await request(app).get('/api/members');
    expect(unauth.status).toBe(401);

    const memberLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'member@beanbalance.com', password: 'Member123!' });

    const memberAccess = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${memberLogin.body.token}`);

    expect(memberAccess.status).toBe(403);
  });
});
