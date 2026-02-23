import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import type { JwtPayload } from '../decorators/current-user.decorator';

@Injectable()
export class SystemAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const user = (req as any).user as JwtPayload | undefined;
    return user?.role === 'system_admin';
  }
}
