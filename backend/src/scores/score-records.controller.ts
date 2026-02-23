import { Controller, Delete, Param, UseGuards } from '@nestjs/common';
import { ScoresService } from './scores.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@Controller('api/score-records')
@UseGuards(JwtAuthGuard)
export class ScoreRecordsController {
  constructor(private readonly service: ScoresService) {}

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.removeScore(+id, user.sub);
  }
}
