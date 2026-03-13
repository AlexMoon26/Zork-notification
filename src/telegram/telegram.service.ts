import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import TelegramBotLib, {
  SendAnimationOptions,
  SendMessageOptions,
  SendPhotoOptions,
  SendVideoOptions,
} from 'node-telegram-bot-api';
import { BotCommandsService } from './bot-commands.service';

interface TelegramMessage {
  chat: { id: number };
  text?: string;
}

interface TelegramBotClient {
  on(event: 'polling_error', listener: (error: Error) => void): void;
  on(event: 'message', listener: (msg: TelegramMessage) => void): void;
  on(event: 'callback_query', listener: (query: any) => void): this;
  answerCallbackQuery(callbackQueryId: string): Promise<unknown>;
  onText(
    regexp: RegExp,
    callback: (msg: TelegramMessage, match: RegExpExecArray | null) => void,
  ): void;
  sendMessage(
    chatId: number | string,
    text: string,
    options?: SendMessageOptions,
  ): Promise<unknown>;
  sendPhoto(
    chatId: number | string,
    photo: Buffer,
    options?: SendPhotoOptions,
  ): Promise<unknown>;
  sendAnimation(
    chatId: number | string,
    animation: Buffer,
    options?: SendAnimationOptions,
    fileOptions?: { filename: string; contentType: string },
  ): Promise<unknown>;
  sendVideo(
    chatId: number | string,
    video: Buffer,
    options?: SendVideoOptions,
  ): Promise<unknown>;
  deleteMessage(chatId: number, messageId: number): Promise<unknown>;
}

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private bot: TelegramBotClient;
  private readonly chatId: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => BotCommandsService))
    private readonly botCommands: BotCommandsService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    this.chatId = this.configService.get<string>('TELEGRAM_CHAT_ID') ?? '';

    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
    if (!this.chatId) throw new Error('TELEGRAM_CHAT_ID is required');

    process.env.NTBA_FIX_350 = '1';

    const TelegramBot = TelegramBotLib as any;
    this.bot = new TelegramBot(token, { polling: true });

    this.bot.on('polling_error', (error: Error) => {
      this.logger.error(`Polling error: ${error.message}`, error.stack);
    });
  }

  onModuleInit() {
    this.botCommands.registerHandlers(this.bot);
  }

  async sendMessage(
    chatId: number,
    text: string,
    options?: SendMessageOptions,
  ): Promise<any> {
    try {
      return await this.bot.sendMessage(chatId, text, options);
    } catch (error) {
      this.logger.error('Error sending message', error);
      return null;
    }
  }

  async sendPhoto(
    chatId: number,
    photo: Buffer,
    caption?: string,
  ): Promise<void> {
    try {
      await this.bot.sendPhoto(chatId, photo, { caption, parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error('Error sending photo', error);
    }
  }

  async sendVideo(
    chatId: number,
    video: Buffer,
    caption?: string,
  ): Promise<void> {
    this.logger.log(
      `sendVideo called, chatId=${chatId}, size=${video.length} bytes, caption="${caption}"`,
    );
    try {
      const options: SendVideoOptions = {
        caption,
        parse_mode: 'HTML',
        // Если нужно указать имя файла, можно добавить filename (зависит от версии библиотеки)
        // filename: 'clip.mp4',
      };
      // Убираем fileOptions, так как могут быть проблемы с типами
      const result = await this.bot.sendVideo(chatId, video, options);
      this.logger.log(
        `sendVideo completed successfully, message_id=${(result as any)?.message_id}`,
      );
    } catch (error) {
      this.logger.error(
        `sendVideo caught error: ${error.message}`,
        error.stack,
      );
    }
  }

  async answerCallbackQuery(queryId: string): Promise<void> {
    try {
      await this.bot.answerCallbackQuery(queryId);
    } catch (error) {
      this.logger.error('Error answering callback query', error);
    }
  }

  async deleteMessage(chatId: number, messageId: number): Promise<void> {
    try {
      await this.bot.deleteMessage(chatId, messageId);
    } catch (error) {
      this.logger.error(
        `Error deleting message ${messageId} in chat ${chatId}`,
        error,
      );
    }
  }

  async sendMessageDeprecated(text: string): Promise<void> {
    await this.sendMessage(Number(this.chatId), text, { parse_mode: 'HTML' });
  }
}
