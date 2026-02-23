import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

@Controller('api/users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list() {
    return this.usersService.findAll();
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  @Post()
  async create(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.usersService.create(user, body as any);
  }

  @Put(':id')
  async update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: unknown) {
    return this.usersService.update(user, +id, body as any);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.usersService.remove(user, +id);
  }
}
