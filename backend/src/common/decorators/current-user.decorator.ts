import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type UserRole = 'system_admin' | 'department_admin' | 'user';

export interface JwtPayload {
  sub: number;
  username: string;
  isAdmin: boolean;
  role: UserRole;
  departmentId?: number;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext): JwtPayload | unknown => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload;
    return data ? user?.[data] : user;
  },
);
