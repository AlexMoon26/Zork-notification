import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FrigateModule } from '../frigate/frigate.module';
import { TelegramModule } from '../telegram/telegram.module';
import { OnvifService } from './onvif.service';

@Module({
  imports: [ConfigModule, FrigateModule, TelegramModule],
  providers: [OnvifService],
  exports: [OnvifModule],
})
export class OnvifModule {}
