import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  email: z.string().trim().email('Invalid email address'),
  phone: z.string().trim().min(7, 'Phone number is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['MEMBER', 'STAFF']).optional().default('MEMBER'),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Email or phone is required'),
  password: z.string().min(1, 'Password is required'),
});

export const memberSearchSchema = z.object({
  search: z.string().optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(10),
  sortBy: z.enum(['name', 'phone', 'tier', 'currentPoints', 'lifetimeEarnedPoints', 'createdAt']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const purchaseSchema = z.object({
  amountPaise: z.coerce.number().int().min(1, 'Purchase amount must be a positive integer'),
  receiptNumber: z.string().trim().min(1).max(80).optional(),
});

export const redemptionSchema = z.object({
  rewardId: z.string().trim().min(1, 'Reward is required'),
});

export const rewardSchema = z.object({
  name: z.string().trim().min(2, 'Reward name is required'),
  description: z.string().trim().min(2, 'Description is required'),
  pointsCost: z.coerce.number().int().min(1, 'Points cost must be at least 1'),
  isActive: z.boolean().optional().default(true),
});

export const memberIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Member id is required'),
});
