import { Module } from '@nestjs/common';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';
import { RankingRefreshProcessor } from './ranking-refresh.processor';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [AssessmentsController],
  providers: [AssessmentsService, RankingRefreshProcessor],
})
export class AssessmentsModule {}
