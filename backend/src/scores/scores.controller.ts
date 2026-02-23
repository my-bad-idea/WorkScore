import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ScoresService } from './scores.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@Controller('api/work-records')
@UseGuards(JwtAuthGuard)
export class ScoresController {
  constructor(private readonly service: ScoresService) {}

  @Get(':id/scores')
  async listScores(@Param('id') id: string) {
    return this.service.findByWorkRecordId(+id);
  }

  @Get(':id/criteria')
  async getCriteria(@Param('id') id: string) {
    return this.service.getCriteriaForWorkRecord(+id);
  }

  @Get(':id/summary')
  async getSummary(@Param('id') id: string) {
    return this.service.getSummary(+id);
  }

  @Post(':id/scores')
  async createScore(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Body() body: { scoreDetails: { item_name: string; score: number; comment?: string }[]; totalScore: number; remark: string }) {
    return this.service.createScore(+id, user.sub, body);
  }
}
