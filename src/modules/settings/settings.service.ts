import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const settings = await this.prisma.settings.findUnique({ where: { id: 'main' } });
    if (settings) return settings;
    // fallback por si no se corrió el seed
    return this.prisma.settings.create({
      data: {
        id: 'main',
        bankCbu: '',
        bankHolder: '',
        ticketHours: 24,
      },
    });
  }

  async update(dto: UpdateSettingsDto) {
    return this.prisma.settings.upsert({
      where: { id: 'main' },
      update: { ...dto },
      create: { id: 'main', ...dto },
    });
  }
}
