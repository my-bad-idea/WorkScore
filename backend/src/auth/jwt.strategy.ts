import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-secret-change-in-prod',
    });
  }

  async validate(payload: { sub: number; username: string; isAdmin?: boolean; role?: string; departmentId?: number }): Promise<JwtPayload> {
    if (!payload?.sub) throw new UnauthorizedException();
    const role =
      payload.role === 'system_admin' || payload.role === 'department_admin'
        ? payload.role
        : ('user' as const);
    return {
      sub: payload.sub,
      username: payload.username,
      isAdmin: payload.isAdmin ?? role === 'system_admin',
      role,
      departmentId: payload.departmentId,
    };
  }
}
