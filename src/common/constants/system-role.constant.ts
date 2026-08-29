export const SYSTEM_ROLES = {
  ADMIN: 'ADMIN',
  USER: 'USER',
  MANAGER: 'MANAGER',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];
