import { Module, forwardRef } from '@nestjs/common';
import { ScoresController } from './scores.controller';
import { ScoreQueueController } from './score-queue.controller';
import { ScoreRecordsController } from './score-records.controller';
import { ScoresAiTestController } from './scores-ai-test.controller';
import { ScoresService } from './scores.service';
import { ScoreQueueProcessor } from './score-queue.processor';
import { WorkRecordsModule } from '../work-records/work-records.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [forwardRef(() => WorkRecordsModule), SettingsModule],
  controllers: [ScoresController, ScoreQueueController, ScoreRecordsController, ScoresAiTestController],
  providers: [ScoresService, ScoreQueueProcessor],
  exports: [ScoresService],
})
export class ScoresModule {}
