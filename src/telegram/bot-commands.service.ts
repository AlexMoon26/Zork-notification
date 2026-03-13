import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { SendMessageOptions } from 'node-telegram-bot-api';
import { FrigateService } from '../frigate/frigate.service';
import { NotificationStateService } from './notification-state.service';
import { TelegramService } from './telegram.service';

@Injectable()
export class BotCommandsService {
  private readonly logger = new Logger(BotCommandsService.name);

  constructor(
    @Inject(forwardRef(() => TelegramService))
    private readonly telegram: TelegramService,
    private readonly frigate: FrigateService,
    private readonly state: NotificationStateService,
  ) {}

  registerHandlers(bot: any) {
    const mainMenu: SendMessageOptions = {
      reply_markup: {
        keyboard: [
          [
            { text: '🔔 Включить уведомления' },
            { text: '🔕 Выключить уведомления' },
          ],
          [{ text: '📸 Кадр с камеры' }],
        ],
        resize_keyboard: true,
      },
      parse_mode: 'HTML',
    };

    bot.onText(/\/start/, async (msg: any) => {
      await this.telegram.sendMessage(
        msg.chat.id,
        'Привет! Я сторожевой пёс Берта 🐕. Дача под мою ответственность 🏡. Никто не останется незамеченным 👀.\nВот что я умею: 📋',
        mainMenu,
      );
      await this.telegram.deleteMessage(msg.chat.id, msg.message_id);
    });

    bot.on('message', async (msg: any) => {
      if (!msg.text) return;
      const chatId = msg.chat.id;

      switch (msg.text) {
        case '🔔 Включить уведомления':
          this.state.setEnabled(chatId, true);
          await this.telegram.sendMessage(
            chatId,
            'Уведомления включены ✅',
            mainMenu,
          );
          this.logger.log(`Notifications enabled for chat ${chatId}`);
          break;
        case '🔕 Выключить уведомления':
          this.state.setEnabled(chatId, false);
          await this.telegram.sendMessage(
            chatId,
            'Уведомления выключены ❌',
            mainMenu,
          );
          this.logger.log(`Notifications disabled for chat ${chatId}`);
          break;
        case '📸 Кадр с камеры':
          await this.showCameraSelection(chatId);
          break;
        default:
          return;
      }
      await this.telegram.deleteMessage(chatId, msg.message_id);
    });
    bot.onText(/\/enable_notifications/, async (msg: any) => {
      this.state.setEnabled(msg.chat.id, true);
      await this.telegram.sendMessage(
        msg.chat.id,
        'Уведомления включены ✅',
        mainMenu,
      );
      await this.telegram.deleteMessage(msg.chat.id, msg.message_id);
    });

    bot.onText(/\/disable_notifications/, async (msg: any) => {
      this.state.setEnabled(msg.chat.id, false);
      await this.telegram.sendMessage(
        msg.chat.id,
        'Уведомления выключены ❌',
        mainMenu,
      );
      await this.telegram.deleteMessage(msg.chat.id, msg.message_id);
    });

    bot.onText(/\/snapshot$/, async (msg: any) => {
      await this.showCameraSelection(msg.chat.id);
      await this.telegram.deleteMessage(msg.chat.id, msg.message_id);
    });

    bot.on('callback_query', async (query: any) => {
      const chatId = query.message?.chat.id;
      if (!chatId || !query.data) return;

      if (query.message) {
        await this.telegram.deleteMessage(chatId, query.message.message_id);
        this.state.clearLastCameraMessageId(chatId);
      }

      if (query.data.startsWith('camera:')) {
        const camera = query.data.substring(7);
        await this.telegram.answerCallbackQuery(query.id);
        await this.sendSnapshot(chatId, camera);
      }
    });
  }

  private async showCameraSelection(chatId: number) {
    const prevMsgId = this.state.getLastCameraMessageId(chatId);
    if (prevMsgId) {
      await this.telegram.deleteMessage(chatId, prevMsgId);
      this.state.clearLastCameraMessageId(chatId);
    }

    const cameras = await this.frigate.getCameras();
    if (!cameras.length) {
      await this.telegram.sendMessage(
        chatId,
        'Не удалось получить список камер. Проверьте подключение к Frigate.',
      );
      return;
    }

    const inlineKeyboard = cameras.map((camera) => [
      { text: camera, callback_data: `camera:${camera}` },
    ]);

    const sentMsg = await this.telegram.sendMessage(
      chatId,
      'Выберите камеру:',
      {
        reply_markup: { inline_keyboard: inlineKeyboard },
      },
    );
    if (sentMsg?.message_id) {
      this.state.setLastCameraMessageId(chatId, sentMsg.message_id);
    }
  }

  private async sendSnapshot(chatId: number, camera: string) {
    const snapshot = await this.frigate.getSnapshot(camera);
    if (snapshot) {
      await this.telegram.sendPhoto(
        chatId,
        snapshot,
        `📸 Снимок с камеры ${camera}`,
      );
    } else {
      await this.telegram.sendMessage(
        chatId,
        `Не удалось получить снимок с камеры ${camera}.`,
      );
    }
  }

  isNotificationsEnabled(chatId: number): boolean {
    return this.state.isEnabled(chatId);
  }
}
