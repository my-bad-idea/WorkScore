import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AssessmentsService } from './assessments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('api/assessments')
@UseGuards(JwtAuthGuard)
export class AssessmentsController {
  constructor(private readonly service: AssessmentsService) {}

  @Get('monthly')
  async monthly(@Query('year') year: string, @Query('month') month: string, @Query('departmentId') departmentId?: string, @Query('positionId') positionId?: string) {
    return this.service.getMonthlyRankings(year, month, departmentId, positionId);
  }

  @Get('yearly')
  async yearly(@Query('year') year: string, @Query('departmentId') departmentId?: string, @Query('positionId') positionId?: string) {
    return this.service.getYearlyRankings(year, departmentId, positionId);
  }
}
