import type { Request } from 'express';

export interface IGoogleAuth {
  name: {
    givenName: string;
    familyName: string;
  };
  emails: [{ value: string }];
  photos: { value: string }[];
}

export enum PermissionAction {
  MANAGE = 'manage',
  READ = 'read',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
}

export enum PermissionSubject {
  ALL = 'all',
  ROLE = 'role',
  PERMISSION = 'permission',
  USER = 'user',
  PASSAGE = 'passage',
  PARAGRAPH = 'paragraph',
  DASHBOARD = 'dashboard',
  STUDENT = 'student',
  TEACHER = 'teacher',
  TEST = 'test',
  QUESTION = 'question',
  CAMPUS = 'campus',
  PROGRAM = 'program',
  LEVEL = 'level',
}

export interface ITokenPayload {
  email: string;
  roleId: number;
  id: string;
  client: AuthClient;
  permissions: Array<{
    action: PermissionAction;
    subject: PermissionSubject;
  }>;
}

export interface IRequestWithUser extends Request {
  user: ITokenPayload;
}

export interface IRequestWithGoogleUser extends Request {
  user: IGoogleProfile;
}

export interface IGoogleProfile {
  email?: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  accessToken: string;
  refreshToken: string;
}

export const UserErrorEnum = {
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  CMS_ACCESS_DENIED: 'CMS_ACCESS_DENIED',
  REFRESH_TOKEN_ROTATED: 'REFRESH_TOKEN_ROTATED',
} as const;
export type UserErrorEnum = (typeof UserErrorEnum)[keyof typeof UserErrorEnum];

export interface IRefreshTokenPayload {
  sub: string; // user id
  jti: string; // session id
  client: AuthClient;
}

export enum AuthClient {
  WEB = 'web',
  BO = 'bo',
}

export const isAuthClient = (value: unknown): value is AuthClient =>
  Object.values<unknown>(AuthClient).includes(value);

export const isServerClient = (client: AuthClient) => client === AuthClient.WEB;
