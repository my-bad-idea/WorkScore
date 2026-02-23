import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SystemAdminGuard } from '../common/guards/system-admin.guard';

@Controller('api/settings')
@UseGuards(JwtAuthGuard, SystemAdminGuard)
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  async get() {
    return this.service.getAll();
  }

  @Put()
  async update(@Body() body: Record<string, string>) {
    return this.service.update(body);
  }
}
