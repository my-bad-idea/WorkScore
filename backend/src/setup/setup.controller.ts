import { Controller, Get, Post, Body, ConflictException } from '@nestjs/common';
import { SetupService } from './setup.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('api/setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Public()
  @Get('status')
  async status() {
    return this.setupService.getStatus();
  }

  @Public()
  @Post('init')
  async init(@Body() body: { username: string; password: string; realName: string }) {
    const status = await this.setupService.getStatus();
    if (status.installed) throw new ConflictException('Already installed');
    return this.setupService.init(body);
  }
}
