import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController, PublicSettingsController } from './settings.controller';

@Module({
  providers: [SettingsService],
  controllers: [SettingsController, PublicSettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}
