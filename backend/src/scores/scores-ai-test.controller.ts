import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ScoresService } from './scores.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DepartmentAdminOrSystemGuard } from '../common/guards/department-admin-or-system.guard';

@Controller('api/scores')
@UseGuards(JwtAuthGuard, DepartmentAdminOrSystemGuard)
export class ScoresAiTestController {
  constructor(private readonly service: ScoresService) {}

  @Post('ai-test')
  async aiTest(@Body() body: { criteriaMarkdown: string; workContent: string }) {
    return this.service.aiTest(body.criteriaMarkdown ?? '', body.workContent ?? '');
  }

  @Post('ai-generate-criteria')
  async aiGenerateCriteria(@Body() body: { departmentName: string; positionName: string; requirements?: string }) {
    return this.service.aiGenerateCriteria(body.departmentName ?? '', body.positionName ?? '', body.requirements);
  }
}
