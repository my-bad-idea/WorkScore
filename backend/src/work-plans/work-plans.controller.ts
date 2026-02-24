import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { WorkPlansService } from './work-plans.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@Controller('api/work-plans')
@UseGuards(JwtAuthGuard)
export class WorkPlansController {
  constructor(private readonly service: WorkPlansService) {}

  @Get()
  async list(@CurrentUser() user: JwtPayload, @Query() query: Record<string, string>) {
    return this.service.findAll(user, query);
  }

  @Put('batch/reorder')
  async reorder(@CurrentUser() user: JwtPayload, @Body() body: { items: { id: number; sortOrder: number }[] }) {
    await this.service.reorder(user, body.items);
    return { message: 'ok' };
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(+id, user);
  }

  @Post()
  async create(@CurrentUser() user: JwtPayload, @Body() body: {
    userId?: number; executorId?: number;
    system?: string; module?: string; planContent: string;
    plannedStartAt?: string; plannedEndAt?: string; plannedDurationMinutes?: number;
    actualStartAt?: string; actualEndAt?: string; actualDurationMinutes?: number;
    priority?: string; status?: string; remark?: string; sortOrder?: number;
  }) {
    return this.service.create(user, body);
  }

  @Put(':id')
  async update(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Body() body: {
    executorId?: number | null;
    system?: string; module?: string; planContent?: string;
    plannedStartAt?: string; plannedEndAt?: string; plannedDurationMinutes?: number;
    actualStartAt?: string; actualEndAt?: string; actualDurationMinutes?: number;
    priority?: string; status?: string; remark?: string; sortOrder?: number;
  }) {
    return this.service.update(+id, user, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(+id, user);
  }
}
