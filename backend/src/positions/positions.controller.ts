import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

@Controller('api/positions')
@UseGuards(JwtAuthGuard)
export class PositionsController {
  constructor(private readonly service: PositionsService) {}

  @Get()
  async list() {
    return this.service.findAll();
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Post()
  async create(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.service.create(user, body as any);
  }

  @Put(':id')
  async update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: unknown) {
    return this.service.update(user, +id, body as any);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.remove(user, +id);
  }
}
