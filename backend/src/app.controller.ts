import { Controller, Get, Redirect } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get()
  @Redirect('/login', 302)
  root() {}
}
