import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { existsSync } from 'fs';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './config/database.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { SetupModule } from './setup/setup.module';
import { DepartmentsModule } from './departments/departments.module';
import { PositionsModule } from './positions/positions.module';
import { UsersModule } from './users/users.module';
import { SettingsModule } from './settings/settings.module';
import { WorkRecordsModule } from './work-records/work-records.module';
import { ScoresModule } from './scores/scores.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { WorkPlansModule } from './work-plans/work-plans.module';

const publicPath = join(__dirname, '..', 'public');
const hasPublic = existsSync(publicPath) && existsSync(join(publicPath, 'index.html'));

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    SetupModule,
    DepartmentsModule,
    PositionsModule,
    UsersModule,
    SettingsModule,
    WorkRecordsModule,
    ScoresModule,
    AssessmentsModule,
    WorkPlansModule,
    ...(hasPublic
      ? [
          ServeStaticModule.forRoot({
            rootPath: publicPath,
            serveRoot: '/',
            serveStaticOptions: { index: 'index.html', fallthrough: true },
          }),
        ]
      : []),
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
