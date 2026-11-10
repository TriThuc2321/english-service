import { PermissionAction, PermissionSubject } from '../../types/auth.type.js';

export enum SystemRoleCode {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  TEACHER = 'TEACHER',
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
  [SystemRoleCode.TEACHER]: { name: 'Teacher', canAccessCms: true },
  [SystemRoleCode.USER]: { name: 'User', canAccessCms: false },
};

type PermissionPair = [PermissionAction, PermissionSubject];

const ADMIN_EXCLUDED_SUBJECTS = new Set([
  PermissionSubject.ALL,
  PermissionSubject.ROLE,
  PermissionSubject.PERMISSION,
]);

export const DEFAULT_ROLE_PERMISSIONS: Record<
  SystemRoleCode,
  PermissionPair[]
> = {
  [SystemRoleCode.SUPER_ADMIN]: [
    [PermissionAction.MANAGE, PermissionSubject.ALL],
  ],
  [SystemRoleCode.ADMIN]: [
    ...Object.values(PermissionAction).flatMap((action) =>
      Object.values(PermissionSubject)
        .filter((subject) => !ADMIN_EXCLUDED_SUBJECTS.has(subject))
        .map((subject): PermissionPair => [action, subject]),
    ),
    [PermissionAction.READ, PermissionSubject.ROLE],
    [PermissionAction.READ, PermissionSubject.PERMISSION],
  ],
  [SystemRoleCode.TEACHER]: [
    [PermissionAction.READ, PermissionSubject.ASSESSMENT],
    [PermissionAction.CREATE, PermissionSubject.ASSESSMENT],
    ...[
      PermissionSubject.TEST,
      PermissionSubject.QUESTION,
      PermissionSubject.PASSAGE,
      PermissionSubject.PARAGRAPH,
      PermissionSubject.MEDIA,
      PermissionSubject.STUDENT,
      PermissionSubject.DASHBOARD,
    ].map((subject): PermissionPair => [PermissionAction.READ, subject]),
  ],
  [SystemRoleCode.USER]: [],
};

export const DEFAULT_USERS: Array<{
  email: string;
  firstName: string;
  roleCode: SystemRoleCode;
  systemUser: boolean;
}> = [
  {
    email: 'superadmin@gmail.com',
    firstName: 'Super Admin',
    roleCode: SystemRoleCode.SUPER_ADMIN,
    systemUser: true,
  },
  {
    email: 'admin@gmail.com',
    firstName: 'Admin',
    roleCode: SystemRoleCode.ADMIN,
    systemUser: true,
  },
  {
    email: 'teacher@gmail.com',
    firstName: 'Teacher',
    roleCode: SystemRoleCode.TEACHER,
    systemUser: false,
  },
  {
    email: 'user@gmail.com',
    firstName: 'User',
    roleCode: SystemRoleCode.USER,
    systemUser: false,
  },
];
