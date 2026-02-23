import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SystemAdminGuard } from '../common/guards/system-admin.guard';

@Controller('api/departments')
@UseGuards(JwtAuthGuard)
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Get()
  async list() {
    return this.service.findAll();
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @UseGuards(SystemAdminGuard)
  @Post()
  async create(@Body() body: unknown) {
    return this.service.create(body as any);
  }

  @UseGuards(SystemAdminGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    return this.service.update(+id, body as any);
  }

  @UseGuards(SystemAdminGuard)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
