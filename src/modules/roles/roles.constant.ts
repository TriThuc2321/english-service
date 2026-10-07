export enum SystemRoleCode {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export const SYSTEM_ROLES: Record<
  SystemRoleCode,
  { name: string; canAccessCms: boolean }
> = {
  [SystemRoleCode.SUPER_ADMIN]: {
    name: 'Super Administrator',
    canAccessCms: true,
  },
  [SystemRoleCode.ADMIN]: { name: 'Administrator', canAccessCms: true },
  [SystemRoleCode.USER]: { name: 'User', canAccessCms: false },
};
