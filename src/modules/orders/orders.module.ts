import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController, PublicOrdersController } from './orders.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [OrdersService],
  controllers: [OrdersController, PublicOrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
