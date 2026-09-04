import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AdjustStockDto {
  // cantidad a sumar (positiva) o restar (negativa) del stock actual
  @IsInt()
  quantity: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class SetStockDto {
  @IsInt()
  stock: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class FindProductsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  lowStock?: string; // 'true' filtra productos con stock <= minStock

  @IsOptional()
  @IsNotEmpty()
  active?: string;
}
