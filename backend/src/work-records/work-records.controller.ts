import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { WorkRecordsService } from './work-records.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@Controller('api/work-records')
@UseGuards(JwtAuthGuard)
export class WorkRecordsController {
  constructor(private readonly service: WorkRecordsService) {}

  @Get()
  async list(@Query() query: Record<string, string>) {
    return this.service.findAll(query);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Post()
  async create(@CurrentUser() user: JwtPayload, @Body() body: { type: string; recordDate: string; content: string }) {
    return this.service.create(user.sub, body);
  }

  @Put(':id')
  async update(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Body() body: { type?: string; recordDate?: string; content?: string }) {
    return this.service.update(+id, user.sub, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(+id, user.sub);
  }
}
