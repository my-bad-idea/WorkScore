import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get()
  root() {
    return {
      name: '工作智能评分平台 API',
      version: '0.1.0',
      message: 'API 路由位于 /api 下，请使用前端页面或访问 /api/setup/status 等接口。',
      api: {
        setup: '/api/setup',
        auth: '/api/auth',
        departments: '/api/departments',
        positions: '/api/positions',
        users: '/api/users',
        settings: '/api/settings',
        workRecords: '/api/work-records',
        scoreQueue: '/api/score-queue',
        assessments: '/api/assessments',
      },
    };
  }
}
