import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ScoresService } from './scores.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DepartmentAdminOrSystemGuard } from '../common/guards/department-admin-or-system.guard';

@Controller('api/score-queue')
@UseGuards(JwtAuthGuard, DepartmentAdminOrSystemGuard)
export class ScoreQueueController {
  constructor(private readonly service: ScoresService) {}

  @Get()
  async list(@Query() _query: Record<string, string>) {
    return this.service.getQueueList(_query);
  }
}
