import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

// Se considera "vendido" todo pedido que ya tuvo pago confirmado
// (pago confirmado, en preparación o completado). Pendientes/vencidos/cancelados no cuentan.
const SOLD_STATUSES: OrderStatus[] = [
  OrderStatus.PAGO_CONFIRMADO,
  OrderStatus.EN_PREPARACION,
  OrderStatus.COMPLETADO,
];

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [pendingCount, confirmedCount, preparingCount, completedCount, lowStockProducts] =
      await Promise.all([
        this.prisma.order.count({ where: { status: OrderStatus.PENDIENTE_PAGO } }),
        this.prisma.order.count({ where: { status: OrderStatus.PAGO_CONFIRMADO } }),
        this.prisma.order.count({ where: { status: OrderStatus.EN_PREPARACION } }),
        this.prisma.order.count({ where: { status: OrderStatus.COMPLETADO } }),
        this.prisma.product.findMany({ where: { active: true } }),
      ]);

    const revenueAgg = await this.prisma.order.aggregate({
      where: { status: { in: SOLD_STATUSES } },
      _sum: { total: true },
      _count: true,
    });

    const lowStock = lowStockProducts.filter((p) => p.stock <= p.minStock);

    return {
      orders: {
        pendientePago: pendingCount,
        pagoConfirmado: confirmedCount,
        enPreparacion: preparingCount,
        completado: completedCount,
      },
      revenue: {
        total: revenueAgg._sum.total ?? 0,
        ordersCount: revenueAgg._count,
      },
      lowStockCount: lowStock.length,
      lowStockProducts: lowStock.slice(0, 10),
    };
  }

  // Productos más vendidos (por cantidad y por ingresos)
  async topProducts(limit = 10) {
    const grouped = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: { status: { in: SOLD_STATUSES } } },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });

    const productIds = grouped.map((g) => g.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { images: { where: { isPrimary: true }, take: 1 } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    return grouped.map((g) => ({
      product: productMap.get(g.productId) ?? null,
      quantitySold: g._sum.quantity ?? 0,
      revenue: g._sum.subtotal ?? 0,
    }));
  }

  // Ventas agrupadas por mes (últimos `months` meses)
  async monthlySales(months = 12) {
    const since = new Date();
    since.setMonth(since.getMonth() - (months - 1));
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: SOLD_STATUSES },
        createdAt: { gte: since },
      },
      select: { createdAt: true, total: true, items: { select: { quantity: true } } },
    });

    const buckets = new Map<string, { orders: number; units: number; revenue: number }>();
    for (const order of orders) {
      const key = `${order.createdAt.getFullYear()}-${String(order.createdAt.getMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.get(key) ?? { orders: 0, units: 0, revenue: 0 };
      bucket.orders += 1;
      bucket.units += order.items.reduce((acc, i) => acc + i.quantity, 0);
      bucket.revenue += Number(order.total);
      buckets.set(key, bucket);
    }

    return Array.from(buckets.entries())
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([month, data]) => ({ month, ...data }));
  }
}
