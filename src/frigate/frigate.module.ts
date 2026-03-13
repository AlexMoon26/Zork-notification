import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FrigateService } from './frigate.service';

@Module({
  imports: [ConfigModule],
  providers: [FrigateService],
  exports: [FrigateService],
})
export class FrigateModule {}

