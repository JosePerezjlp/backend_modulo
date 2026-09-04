import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class OrdersExpiryTask {
  private readonly logger = new Logger(OrdersExpiryTask.name);

  constructor(private readonly ordersService: OrdersService) {}

  // Corre cada 5 minutos: vence los tickets impagos y devuelve el stock reservado
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleExpiredOrders() {
    const result = await this.ordersService.expireOverdueOrders();
    if (result.expired > 0) {
      this.logger.log(`${result.expired} pedido(s) vencido(s) por falta de pago. Stock devuelto.`);
    }
  }
}
