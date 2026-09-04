import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { OrdersExpiryTask } from './orders-expiry.task';

@Module({
  imports: [OrdersModule],
  providers: [OrdersExpiryTask],
})
export class SchedulerModule {}
