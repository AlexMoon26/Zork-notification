import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { connect, MqttClient } from 'mqtt';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: MqttClient;
  private pendingMedia = new Map<
    string,
    {
      resolve: (buffer: Buffer) => void;
      reject: (reason?: any) => void;
      timeout: NodeJS.Timeout;
      mediaType: 'snapshot' | 'clip';
    }
  >();

  constructor(
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    const brokerUrl = this.configService.get<string>('MQTT_BROKER_URL');
    const options = {
      username: this.configService.get<string>('MQTT_USERNAME'),
      password: this.configService.get<string>('MQTT_PASSWORD'),
    };

    if (!brokerUrl) {
      this.logger.error('MQTT_BROKER_URL is not defined');
      return;
    }

    this.client = connect(brokerUrl, options);

    this.client.on('connect', () => {
      this.logger.log('Connected to MQTT broker');
      this.client.subscribe('frigate/events', (err) => {
        if (!err) {
          this.logger.log('Subscribed to frigate/events');
        } else {
          this.logger.error('Failed to subscribe to frigate/events', err);
        }
      });
      this.client.subscribe('frigate/tracked_object_update', (err) => {
        if (!err) {
          this.logger.log('Subscribed to frigate/tracked_object_update');
        } else {
          this.logger.error(
            'Failed to subscribe to frigate/tracked_object_update',
            err,
          );
        }
      });
    });

    this.client.on('message', (topic, payload) => {
      // Обработка событий (JSON)
      if (topic === 'frigate/events') {
        const message = payload.toString();
        this.logger.debug(
          `Received event message: ${message.substring(0, 200)}...`,
        );
        try {
          const event = JSON.parse(message);
          this.eventEmitter.emit('frigate.event', event);
          const emitted = this.eventEmitter.emit('frigate.event', event);
          this.logger.debug(
            `Emitted frigate.event, listeners present: ${emitted}`,
          );
        } catch (e) {
          this.logger.error('Failed to parse MQTT message', e);
        }
        return;
      }

      if (topic === 'frigate/tracked_object_update') {
        try {
          const data = JSON.parse(payload.toString());
          if (data.type === 'lpr' && data.plate) {
            this.logger.log(
              `🚗 LPR: номер ${data.plate} (камера ${data.camera})`,
            );
            this.eventEmitter.emit('frigate.lpr', {
              plate: data.plate,
              eventId: data.id,
              camera: data.camera,
              timestamp: data.timestamp,
              score: data.score,
            });
          }
        } catch (e) {
          this.logger.error('Failed to parse tracked_object_update', e);
        }
        return;
      }
    });

    this.client.on('error', (err) => {
      this.logger.error('MQTT client error', err);
    });
  }

  onModuleDestroy() {
    if (this.client) {
      for (const [eventId, { timeout, reject }] of this.pendingMedia) {
        clearTimeout(timeout);
        reject(new Error('Service is shutting down'));
      }
      this.pendingMedia.clear();
      this.client.end();
    }
  }
}
