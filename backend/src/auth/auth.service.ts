import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { SettingsService } from '../settings/settings.service';
import type { UserRow, UserRole } from '../users/users.service';
import { validatePasswordStrength } from '../common/password.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly settingsService: SettingsService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);
    if (!user || !user.enabled) throw new UnauthorizedException('Invalid username or password');
    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) throw new UnauthorizedException('Invalid username or password');

    const hours = this.settingsService.get('token_expire_hours') ?? '168';
    const expiresIn = `${hours}h`;
    const role = (user.role === 'system_admin' || user.role === 'department_admin' ? user.role : 'user') as UserRole;
    const payload = {
      sub: user.id,
      username: user.username,
      isAdmin: !!user.is_admin,
      role,
      departmentId: user.department_id,
    };
    const access_token = this.jwtService.sign(payload, { expiresIn });

    const profile = this.toProfile(user);
    this.logger.log(`User ${user.username} logged in`);
    return { access_token, user: profile };
  }

  private toProfile(row: UserRow & { department_name?: string; position_name?: string }) {
    const role = (row.role === 'system_admin' || row.role === 'department_admin' ? row.role : 'user') as UserRole;
    return {
      id: row.id,
      username: row.username,
      realName: row.real_name,
      departmentId: row.department_id,
      positionId: row.position_id ?? undefined,
      isAdmin: !!row.is_admin,
      role,
    };
  }

  async getProfile(userId: number) {
    const user = await this.usersService.findOne(userId);
    if (!user) throw new UnauthorizedException();
    return user;
  }

  async changePassword(userId: number, oldPassword: string, newPassword: string) {
    const user = await this.usersService.findOne(userId);
    if (!user) throw new UnauthorizedException();
    const row = await this.usersService.findByUsername(user.username);
    if (!row) throw new UnauthorizedException();
    const ok = bcrypt.compareSync(oldPassword, row.password_hash);
    if (!ok) throw new BadRequestException('Old password is incorrect');
    validatePasswordStrength(newPassword);
    const passwordHash = bcrypt.hashSync(newPassword, 10);
    await this.usersService.updatePassword(userId, passwordHash);
    return { message: 'ok' };
  }
}
