import { Module } from '@nestjs/common';
import { WorkPlansController } from './work-plans.controller';
import { WorkPlansService } from './work-plans.service';
import { ScoresModule } from '../scores/scores.module';

@Module({
  imports: [ScoresModule],
  controllers: [WorkPlansController],
  providers: [WorkPlansService],
  exports: [WorkPlansService],
})
export class WorkPlansModule {}
