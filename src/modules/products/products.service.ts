import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdjustStockDto, FindProductsQueryDto, SetStockDto } from './dto/adjust-stock.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private include = {
    images: { orderBy: { order: 'asc' as const } },
  };

  async findAll(query: FindProductsQueryDto, onlyActive = false) {
    const where: Prisma.ProductWhereInput = {};

    if (onlyActive) where.active = true;
    if (query.active === 'true') where.active = true;
    if (query.active === 'false') where.active = false;

    if (query.brand) where.brand = { equals: query.brand, mode: 'insensitive' };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { brand: { contains: query.search, mode: 'insensitive' } },
        { model: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    let products = await this.prisma.product.findMany({
      where,
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });

    if (query.lowStock === 'true') {
      products = products.filter((p) => p.stock <= p.minStock);
    }

    return products;
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: this.include,
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  async create(dto: CreateProductDto) {
    if (dto.stock > dto.maxStock) {
      throw new BadRequestException('El stock inicial no puede superar el stock máximo');
    }
    const { images, ...data } = dto;
    return this.prisma.product.create({
      data: {
        ...data,
        images: images?.length
          ? { create: images.map((img, idx) => ({ ...img, order: img.order ?? idx })) }
          : undefined,
      },
      include: this.include,
    });
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);
    const { images, ...data } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (images) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        if (images.length) {
          await tx.productImage.createMany({
            data: images.map((img, idx) => ({
              productId: id,
              url: img.url,
              isPrimary: img.isPrimary ?? false,
              order: img.order ?? idx,
            })),
          });
        }
      }
      return tx.product.update({
        where: { id },
        data,
        include: this.include,
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.product.update({ where: { id }, data: { active: false } });
    return { ok: true };
  }

  // Carga manual de stock (ingreso de mercadería) o ajuste
  async addStock(id: string, dto: AdjustStockDto) {
    const product = await this.findOne(id);
    const newStock = product.stock + dto.quantity;
    if (newStock < 0) throw new BadRequestException('El stock no puede quedar negativo');
    if (newStock > product.maxStock) {
      throw new BadRequestException(
        `El stock resultante (${newStock}) supera el máximo permitido (${product.maxStock})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: { stock: newStock },
        include: this.include,
      });
      await tx.stockMovement.create({
        data: {
          productId: id,
          type: dto.quantity >= 0 ? StockMovementType.INGRESO : StockMovementType.AJUSTE,
          quantity: dto.quantity,
          reason: dto.reason ?? 'Ajuste manual de stock',
        },
      });
      return updated;
    });
  }

  async setStock(id: string, dto: SetStockDto) {
    const product = await this.findOne(id);
    const diff = dto.stock - product.stock;
    return this.addStock(id, { quantity: diff, reason: dto.reason ?? 'Corrección de stock' });
  }

  async lowStock() {
    const products = await this.prisma.product.findMany({
      where: { active: true },
      include: this.include,
    });
    return products.filter((p) => p.stock <= p.minStock);
  }

  async movements(id: string) {
    await this.findOne(id);
    return this.prisma.stockMovement.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'desc' },
      include: { order: { select: { ticketNumber: true } } },
    });
  }
}
