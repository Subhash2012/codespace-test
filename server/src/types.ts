export type UserRole = 'MEMBER' | 'STAFF';
export type TierType = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

export type MemberSummary = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  tier: TierType;
  currentPoints: number;
  lifetimeEarnedPoints: number;
  createdAt: Date;
  updatedAt: Date;
};
