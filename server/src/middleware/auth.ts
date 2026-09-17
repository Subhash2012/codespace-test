import { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';

export type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    email: string;
    role: 'MEMBER' | 'STAFF';
  };
};

export async function requireAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError('Authentication required', 401));
  }

  try {
    const token = header.replace('Bearer ', '').trim();
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      return next(new AppError('User not found', 401));
    }

    req.user = { id: user.id, email: user.email, role: user.role as 'MEMBER' | 'STAFF' };
    return next();
  } catch {
    return next(new AppError('Invalid or expired token', 401));
  }
}

export function requireStaff(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'STAFF') {
    return next(new AppError('Staff access required', 403));
  }
  return next();
}

export function requireSelfOrStaff(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }

  const memberId = req.params.id;
  if (req.user.role === 'STAFF' || req.user.id === memberId) {
    return next();
  }

  return next(new AppError('You are not allowed to access this member', 403));
}
