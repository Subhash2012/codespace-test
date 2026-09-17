import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export type AuthUser = {
  id: string;
  email: string;
  role: 'MEMBER' | 'STAFF';
};

export function signToken(user: AuthUser) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, config.jwtSecret, { expiresIn: '7d' });
}

export function verifyToken(token: string) {
  return jwt.verify(token, config.jwtSecret) as { sub: string; email: string; role: 'MEMBER' | 'STAFF' };
}
