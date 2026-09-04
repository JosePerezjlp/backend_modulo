import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { FindOrdersQueryDto, UpdateOrderStatusDto } from './dto/update-order-status.dto';

// Endpoint público: usado por el checkout del ecommerce Next.js
@Controller('public/orders')
export class PublicOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  checkout(@Body() dto: CreateOrderDto) {
    return this.ordersService.checkout(dto);
  }

  // Permite al cliente consultar el estado de su ticket por número
  @Get(':ticket')
  findOne(@Param('ticket') ticket: string) {
    return this.ordersService.findOne(ticket);
  }
}

// Endpoints protegidos: dashboard Vue
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(@Query() query: FindOrdersQueryDto) {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto);
  }
}
