import { Module, forwardRef } from '@nestjs/common';
import { WorkRecordsController } from './work-records.controller';
import { WorkRecordsService } from './work-records.service';
import { ScoresModule } from '../scores/scores.module';

@Module({
  imports: [forwardRef(() => ScoresModule)],
  controllers: [WorkRecordsController],
  providers: [WorkRecordsService],
  exports: [WorkRecordsService],
})
export class WorkRecordsModule {}
