import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FrigateModule } from 'src/frigate/frigate.module';
import { BotCommandsService } from './bot-commands.service';
import { NotificationStateService } from './notification-state.service';
import { TelegramService } from './telegram.service';
import { OnvifModule } from 'src/onvif/onvif.module';
import { OnvifService } from 'src/onvif/onvif.service';

@Module({
  imports: [ConfigModule, FrigateModule],
  providers: [
    TelegramService,
    BotCommandsService,
    NotificationStateService,
    OnvifService,
  ],
  exports: [TelegramService, BotCommandsService, NotificationStateService],
})
export class TelegramModule {}
