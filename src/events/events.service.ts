import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { FrigateService } from '../frigate/frigate.service';
import { BotCommandsService } from '../telegram/bot-commands.service';
import { TelegramService } from '../telegram/telegram.service';
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private readonly chatId: number;
  private readonly labelFilter?: string;
  private readonly processedNewEvents = new Set<string>();
  private readonly processingEvents = new Set<string>();

  constructor(
    private readonly frigateService: FrigateService,
    private readonly telegramService: TelegramService,
    private readonly botCommandsService: BotCommandsService,
    private readonly configService: ConfigService,
  ) {
    this.logger.log('🔥 EventsService constructor called');
    this.chatId = Number(this.configService.get<string>('TELEGRAM_CHAT_ID'));
    this.labelFilter = this.configService.get<string>('LABEL')?.toLowerCase();
  }

  @OnEvent('frigate.event')
  async handleFrigateEvent(mqttEvent: any) {
    if (!mqttEvent.after) return;
    const eventId = mqttEvent.after.id;

    if (this.processingEvents.has(eventId)) {
      this.logger.debug(`Already processing event ${eventId}, skipping`);
      return;
    }
    this.processingEvents.add(eventId);
    try {
      await this._handleFrigateEvent(mqttEvent);
    } finally {
      this.processingEvents.delete(eventId);
    }
  }

  @OnEvent('frigate.lpr')
  async handleLpr(data: any) {
    this.logger.log(
      `Обработка номера ${data.plate} для события ${data.eventId}`,
    );

    if (!this.botCommandsService.isNotificationsEnabled(this.chatId)) {
      this.logger.debug('Notifications disabled, skipping LPR');
      return;
    }

    const date = new Date(data.timestamp * 1000).toLocaleString('ru-RU');
    const caption = `🚗 <b>Обнаружен номер</b>\n📷 Камера: ${data.camera}\n🔢 Номер: <b>${data.plate}</b>\n🎯 Уверенность: ${Math.round(data.score * 100)}%\n🕒 Время: ${date}`;

    try {
      const snapshot = await this.frigateService.getSnapshotWithRetry(
        data.eventId,
        5,
        3000,
      );
      if (snapshot) {
        await this.telegramService.sendPhoto(this.chatId, snapshot, caption);
        this.logger.log(
          `LPR уведомление отправлено с фото для ${data.eventId}`,
        );
      } else {
        await this.telegramService.sendMessage(this.chatId, caption, {
          parse_mode: 'HTML',
        });
        this.logger.warn(
          `Снэпшот для ${data.eventId} не получен, отправлен только текст`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Ошибка отправки LPR уведомления для ${data.eventId}`,
        error,
      );
    }
  }

  private async _handleFrigateEvent(mqttEvent: any) {
    const event = mqttEvent.after;
    const eventType = mqttEvent.type;

    if (event.recognized_license_plate) {
      this.logger.log(`🚗 Номер автомобиля: ${event.recognized_license_plate}`);
      // Здесь можно отправить номер в другой сервис или сохранить
    }

    if (!this.botCommandsService.isNotificationsEnabled(this.chatId)) {
      this.logger.debug('Notifications are disabled, skipping event');
      return;
    }

    if (this.labelFilter && event.label?.toLowerCase() !== this.labelFilter) {
      return;
    }

    if (eventType === 'new') {
      if (this.processedNewEvents.has(event.id)) {
        this.logger.debug(`Duplicate new event for ${event.id}, skipping`);
        return;
      }
      this.processedNewEvents.add(event.id);
      this.logger.log(`New event detected: ${event.id} (${event.label})`);
      await this.sendNewEventNotification(event);
    } else if (eventType === 'end') {
      this.processedNewEvents.delete(event.id);
      this.logger.log(`Event ended: ${event.id} (${event.label})`);
      await this.processEvent(event);
    } else {
      this.logger.debug(`Ignoring event type: ${eventType}`);
    }
  }

  private async sendNewEventNotification(event: any): Promise<void> {
    try {
      const eventMessage = this.formatEventMessage(event);
      const thumbnailBuffer = await this.frigateService.getThumbnailWithRetry(
        event.id,
      );
      if (thumbnailBuffer) {
        await this.telegramService.sendPhoto(
          this.chatId,
          thumbnailBuffer,
          eventMessage,
        );
        this.logger.log(`New event ${event.id} sent with thumbnail`);
      } else {
        await this.telegramService.sendMessage(this.chatId, eventMessage, {
          parse_mode: 'HTML',
        });
        this.logger.warn(`No thumbnail for new event ${event.id}`);
      }
    } catch (error) {
      this.logger.error(
        `Error sending new event notification for ${event.id}`,
        error,
      );
    }
  }

  private async processEvent(event: any): Promise<void> {
    try {
      // Даём Frigate время на финализацию видео
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const eventMessage = this.formatEventMessage(event);

      // Если видео не ожидается, отправляем только фото
      if (!event.has_clip) {
        this.logger.log(
          `Event ${event.id} ended but has_clip=false, sending only thumbnail if available`,
        );
        const thumbnailBuffer = await this.frigateService.getThumbnailWithRetry(
          event.id,
        );
        if (thumbnailBuffer) {
          await this.telegramService.sendPhoto(
            this.chatId,
            thumbnailBuffer,
            eventMessage,
          );
        } else {
          await this.telegramService.sendMessage(this.chatId, eventMessage, {
            parse_mode: 'HTML',
          });
        }
        return;
      }

      const [videoBuffer] = await Promise.all([
        this.frigateService.getClipWithRetry(event.id, 5, 2000),
      ]);

      if (videoBuffer) {
        // Отправляем видео без caption (или с коротким комментарием)
        await this.telegramService.sendVideo(
          this.chatId,
          videoBuffer,
          '🎥 Запись события',
        );
        this.logger.log(`Event ${event.id} sent with video only`);
      } else {
        await this.telegramService.sendMessage(
          this.chatId,
          '❌ Не удалось отправить видео события',
          {
            parse_mode: 'HTML',
          },
        );
        this.logger.warn(`No video for event ${event.id}, sent error`);
      }
    } catch (error) {
      this.logger.error(`Error processing event ${event.id}`, error);
    }
  }

  private epochToDateTime(epoch: number): string {
    return new Date(epoch * 1000).toLocaleString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  private formatEventMessage(event: any): string {
    const {
      camera,
      label,
      zones,
      start_time: startTime,
      top_score,
      score,
    } = event;

    const confidence = top_score ?? score ?? '?';
    const confidencePercent =
      confidence !== '?' ? `${Math.round(confidence * 100)}%` : '?';

    const lines: string[] = [
      '⚠️<b>ОБНАРУЖЕН ЧЕЛОВЕК</b>',
      `📷 <b>Камера:</b> ${camera}`,
      `🏷 <b>Метка:</b> ${label}`,
      `🎯 <b>Совпадение:</b> ${confidencePercent}`,
    ];

    if (zones && Array.isArray(zones) && zones.length > 0) {
      lines.push(`📍 <b>Зоны:</b> ${zones.join(', ')}`);
    }

    lines.push(
      `🕒 <b>Время срабатывания:</b> ${this.epochToDateTime(startTime)}`,
    );

    return lines.join('\n');
  }
}
