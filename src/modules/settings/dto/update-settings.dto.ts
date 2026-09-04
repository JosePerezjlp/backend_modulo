import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsNotEmpty()
  @IsString()
  bankCbu: string;

  @IsOptional()
  @IsString()
  bankAlias?: string;

  @IsNotEmpty()
  @IsString()
  bankHolder: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  ticketHours?: number;
}
