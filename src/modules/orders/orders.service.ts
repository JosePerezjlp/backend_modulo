import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { FindOrdersQueryDto, UpdateOrderStatusDto } from './dto/update-order-status.dto';

// Transiciones de estado permitidas para el dashboard
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDIENTE_PAGO: [OrderStatus.PAGO_CONFIRMADO, OrderStatus.CANCELADO],
  PAGO_CONFIRMADO: [OrderStatus.EN_PREPARACION, OrderStatus.CANCELADO],
  EN_PREPARACION: [OrderStatus.COMPLETADO, OrderStatus.CANCELADO],
  COMPLETADO: [],
  CANCELADO: [],
  VENCIDO: [],
};

// Estados que "reservan" stock (ya descontado del disponible)
const STOCK_HELD_STATUSES: OrderStatus[] = [
  OrderStatus.PENDIENTE_PAGO,
  OrderStatus.PAGO_CONFIRMADO,
  OrderStatus.EN_PREPARACION,
];

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  private include = {
    items: true,
  };

  async findAll(query: FindOrdersQueryDto) {
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { ticketNumber: { contains: query.search, mode: 'insensitive' } },
        { customerName: { contains: query.search, mode: 'insensitive' } },
        { customerPhone: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    return this.prisma.order.findMany({
      where,
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findFirst({
      where: { OR: [{ id }, { ticketNumber: id }] },
      include: this.include,
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return order;
  }

  private async generateTicketNumber(tx: Prisma.TransactionClient) {
    const today = new Date();
    const datePart = today.toISOString().slice(0, 10).replace(/-/g, '');
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));
    const countToday = await tx.order.count({
      where: { createdAt: { gte: startOfDay, lte: endOfDay } },
    });
    const sequence = String(countToday + 1).padStart(4, '0');
    return `MOD-${datePart}-${sequence}`;
  }

  // Checkout público del ecommerce: crea el pedido, reserva stock y genera el ticket
  async checkout(dto: CreateOrderDto) {
    const settings = await this.settingsService.get();
    if (!settings.bankCbu) {
      throw new BadRequestException(
        'La tienda todavía no configuró los datos bancarios. Contactá al administrador.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      let subtotal = 0;
      const itemsData: {
        productId: string;
        productName: string;
        quantity: number;
        unitPrice: Prisma.Decimal;
        subtotal: Prisma.Decimal;
      }[] = [];

      for (const item of dto.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product || !product.active) {
          throw new BadRequestException(`Producto no disponible: ${item.productId}`);
        }
        if (product.stock < item.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para "${product.name}". Disponible: ${product.stock}`,
          );
        }

        const lineSubtotal = Number(product.price) * item.quantity;
        subtotal += lineSubtotal;

        itemsData.push({
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: product.price,
          subtotal: new Prisma.Decimal(lineSubtotal),
        });

        await tx.product.update({
          where: { id: product.id },
          data: { stock: { decrement: item.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            productId: product.id,
            type: StockMovementType.RESERVA,
            quantity: -item.quantity,
            reason: 'Reserva por nuevo pedido (pendiente de pago)',
          },
        });
      }

      const ticketNumber = await this.generateTicketNumber(tx);
      const ticketHours = settings.ticketHours ?? 24;
      const expiresAt = new Date(Date.now() + ticketHours * 60 * 60 * 1000);

      const order = await tx.order.create({
        data: {
          ticketNumber,
          status: OrderStatus.PENDIENTE_PAGO,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          customerEmail: dto.customerEmail,
          customerNote: dto.customerNote,
          subtotal: new Prisma.Decimal(subtotal),
          total: new Prisma.Decimal(subtotal),
          bankCbu: settings.bankCbu,
          bankAlias: settings.bankAlias,
          bankHolder: settings.bankHolder,
          expiresAt,
          items: { create: itemsData },
        },
        include: this.include,
      });

      // vincular los movimientos de stock recién creados con la orden
      await tx.stockMovement.updateMany({
        where: {
          productId: { in: itemsData.map((i) => i.productId) },
          orderId: null,
          type: StockMovementType.RESERVA,
        },
        data: { orderId: order.id },
      });

      return order;
    });
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    const order = await this.findOne(id);
    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `No se puede pasar de "${order.status}" a "${dto.status}"`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.OrderUpdateInput = { status: dto.status };

      if (dto.status === OrderStatus.PAGO_CONFIRMADO) {
        data.paidConfirmedAt = new Date();
      }

      if (dto.status === OrderStatus.CANCELADO) {
        data.cancelledAt = new Date();
        if (STOCK_HELD_STATUSES.includes(order.status)) {
          await this.restoreStock(tx, order.id, 'Pedido cancelado');
        }
      }

      return tx.order.update({
        where: { id: order.id },
        data,
        include: this.include,
      });
    });
  }

  private async restoreStock(tx: Prisma.TransactionClient, orderId: string, reason: string) {
    const items = await tx.orderItem.findMany({ where: { orderId } });
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          orderId,
          type: StockMovementType.DEVOLUCION,
          quantity: item.quantity,
          reason,
        },
      });
    }
  }

  // Usado por el scheduler para vencer pedidos impagos y devolver el stock
  async expireOverdueOrders() {
    const overdue = await this.prisma.order.findMany({
      where: { status: OrderStatus.PENDIENTE_PAGO, expiresAt: { lt: new Date() } },
    });

    for (const order of overdue) {
      await this.prisma.$transaction(async (tx) => {
        await this.restoreStock(tx, order.id, 'Ticket vencido (24hs sin pago)');
        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.VENCIDO },
        });
      });
    }

    return { expired: overdue.length };
  }
}
