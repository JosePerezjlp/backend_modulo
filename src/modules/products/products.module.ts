import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController, PublicProductsController } from './products.controller';

@Module({
  providers: [ProductsService],
  controllers: [ProductsController, PublicProductsController],
  exports: [ProductsService],
})
export class ProductsModule {}
