import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FrigateModule } from '../frigate/frigate.module';
import { TelegramModule } from '../telegram/telegram.module';
import { EventsService } from './events.service';

@Module({
  imports: [ConfigModule, FrigateModule, TelegramModule],
  providers: [EventsService],
  exports: [EventsModule],
})
export class EventsModule {}
