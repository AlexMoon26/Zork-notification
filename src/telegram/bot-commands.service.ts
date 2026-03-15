import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { SendMessageOptions } from 'node-telegram-bot-api';
import { FrigateService } from '../frigate/frigate.service';
import { NotificationStateService } from './notification-state.service';
import { TelegramService } from './telegram.service';
import { OnvifService } from 'src/onvif/onvif.service';
import { InlineKeyboardButton } from 'node-telegram-bot-api';

@Injectable()
export class BotCommandsService {
  private readonly logger = new Logger(BotCommandsService.name);

  constructor(
    @Inject(forwardRef(() => TelegramService))
    private readonly telegram: TelegramService,
    private readonly frigate: FrigateService,
    private readonly state: NotificationStateService,
    private readonly onvifService: OnvifService,
  ) {}

  registerHandlers(bot: any) {
    const mainMenu: SendMessageOptions = {
      reply_markup: {
        keyboard: [
          [
            { text: '🔔 Включить уведомления' },
            { text: '🔕 Выключить уведомления' },
          ],
          [{ text: '📷 Камеры' }],
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
        case '📷 Камеры':
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

    bot.on('callback_query', async (query: any) => {
      const chatId = query.message?.chat.id;
      if (!chatId || !query.data) return;

      const data = query.data;
      const messageId = query.message?.message_id;

      if (data.startsWith('camera:')) {
        if (messageId) {
          await this.telegram.deleteMessage(chatId, messageId);
          this.state.clearLastCameraMessageId(chatId);
        }
        const camera = data.substring(7);

        await this.telegram.answerCallbackQuery(query.id);
        await this.showCameraInfo(chatId, camera);
      } else if (data.startsWith('preset:')) {
        const parts = data.split(':');
        if (parts.length >= 3) {
          const camera = parts[1];
          const presetToken = parts.slice(2).join(':');
          const cameraConfig = await this.frigate.getCameraConfig(camera);

          if (cameraConfig?.onvif?.host) {
            const presets = this.state.getPresets(camera);
            const preset = presets?.find((p) => p.token === presetToken);
            if (preset) {
              const success = await this.onvifService.gotoPreset(
                camera,
                cameraConfig.onvif,
                preset.token,
              );
              await this.telegram.answerCallbackQuery(
                query.id,
                success ? 'Камера повернута' : 'Ошибка поворота',
              );
            } else {
              await this.telegram.answerCallbackQuery(
                query.id,
                'Предустановка не найдена',
              );
            }
          }
        }
      } else if (data.startsWith('refresh:')) {
        const camera = data.substring(8);
        if (messageId) {
          await this.telegram.deleteMessage(chatId, messageId);
          this.state.clearLastCameraMessageId(chatId);
        }
        await this.telegram.answerCallbackQuery(query.id);
        await this.showCameraInfo(chatId, camera);
      } else if (data === 'back_to_cameras') {
        if (messageId) {
          await this.telegram.deleteMessage(chatId, messageId);
          this.state.clearLastCameraMessageId(chatId);
        }
        await this.telegram.answerCallbackQuery(query.id);
        await this.showCameraSelection(chatId);
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

  private async showCameraInfo(chatId: number, camera: string) {
    const prevMsgId = this.state.getLastCameraMessageId(chatId);
    if (prevMsgId) {
      await this.telegram.deleteMessage(chatId, prevMsgId);
      this.state.clearLastCameraMessageId(chatId);
    }

    const snapshot = await this.frigate.getSnapshot(camera);

    const cameraConfig = await this.frigate.getCameraConfig(camera);
    let description = `Камера: ${camera}\n`;
    let hasPtz = false;
    let presets: { token: string; name: string }[] = [];

    console.log(cameraConfig);

    if (cameraConfig?.onvif?.host) {
      hasPtz = true;
      description += `Тип: PTZ\n`;
      try {
        presets = await this.onvifService.getPresets(
          camera,
          cameraConfig.onvif,
        );
        this.state.setPresets(camera, presets);

        if (presets.length > 0) {
          description += `Доступно предустановок: ${presets.length}\n`;
        } else {
          description += `Предустановки не найдены.\n`;
        }
      } catch (e) {
        this.logger.error(`Failed to get presets for ${camera}`, e);
        description += `Ошибка получения предустановок.\n`;
      }
    } else {
      description += `Тип: обычная камера\n`;
    }

    const inlineKeyboard: InlineKeyboardButton[][] = [];

    if (hasPtz && presets.length > 0) {
      const presetButtons = presets.map((p) => ({
        text: p.name || p.token,
        callback_data: `preset:${camera}:${p.token}`,
      }));
      for (let i = 0; i < presetButtons.length; i += 2) {
        inlineKeyboard.push(presetButtons.slice(i, i + 2));
      }
    }
    const actionRow = [
      { text: '🔄 Обновить фото', callback_data: `refresh:${camera}` },
      { text: '🔙 К списку камер', callback_data: 'back_to_cameras' },
    ];
    inlineKeyboard.push(actionRow);

    const replyMarkup = { inline_keyboard: inlineKeyboard };

    let sentMsg;
    if (snapshot) {
      sentMsg = await this.telegram.sendPhoto(chatId, snapshot, description, {
        reply_markup: replyMarkup,
      });
    } else {
      sentMsg = await this.telegram.sendMessage(chatId, description, {
        reply_markup: replyMarkup,
      });
    }

    if (sentMsg?.message_id) {
      this.state.setLastCameraMessageId(chatId, sentMsg.message_id);
    }
  }

  isNotificationsEnabled(chatId: number): boolean {
    return this.state.isEnabled(chatId);
  }
}
