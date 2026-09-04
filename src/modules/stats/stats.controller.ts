import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StatsService } from './stats.service';

@UseGuards(JwtAuthGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('overview')
  overview() {
    return this.statsService.overview();
  }

  @Get('top-products')
  topProducts(@Query('limit') limit?: string) {
    return this.statsService.topProducts(limit ? Number(limit) : undefined);
  }

  @Get('monthly-sales')
  monthlySales(@Query('months') months?: string) {
    return this.statsService.monthlySales(months ? Number(months) : undefined);
  }
}
