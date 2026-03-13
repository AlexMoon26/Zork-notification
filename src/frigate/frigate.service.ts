import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig } from 'axios';

@Injectable()
export class FrigateService {
  private readonly logger = new Logger(FrigateService.name);

  private readonly baseUrl: string;
  private readonly mediaUrl: string;
  private readonly camera?: string;
  private readonly zones?: string;
  private readonly label?: string;
  private readonly username?: string;
  private readonly password?: string;
  private readonly pollingIntervalSeconds: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('FRIGATE_URL') ?? '';
    this.mediaUrl =
      this.configService.get<string>('FRIGATE_MEDIA_URL') ?? this.baseUrl;

    this.camera = this.configService.get<string>('CAMERA') ?? undefined;
    this.zones = this.configService.get<string>('ZONES') ?? undefined;
    this.label = this.configService.get<string>('LABEL') ?? undefined;

    this.username = this.configService.get<string>('FRIGATE_USERNAME') ?? '';
    this.password = this.configService.get<string>('FRIGATE_PASSWORD') ?? '';

    this.pollingIntervalSeconds = Number(
      this.configService.get<string>('POLLING_INTERVAL') ?? '60',
    );

    if (!this.baseUrl) {
      this.logger.error('FRIGATE_URL is not set');
      throw new Error('FRIGATE_URL is required');
    }
  }

  private get authConfig(): AxiosRequestConfig | undefined {
    if (this.username && this.password) {
      return {
        auth: {
          username: this.username,
          password: this.password,
        },
      };
    }

    return undefined;
  }

  private getEpochTimestampFromSecondsAgo(seconds: number): number {
    const nowMs = Date.now();
    return Math.floor((nowMs - seconds * 1000) / 1000);
  }

  async getStatus(): Promise<number | undefined> {
    try {
      const url = `${this.baseUrl}/api/version`;
      const axiosConfig: AxiosRequestConfig = this.authConfig ?? {};

      const response = await axios.get(url, axiosConfig);
      return response.status;
    } catch (error) {
      this.logger.warn('Cannot fetch Frigate status', error as Error);
      return undefined;
    }
  }

  async getEvents(): Promise<any[] | undefined> {
    try {
      const url = `${this.baseUrl}/api/events`;

      const params: Record<string, string | number | undefined> = {
        camera: this.camera,
        zones: this.zones,
        label: this.label,
        after: this.getEpochTimestampFromSecondsAgo(
          this.pollingIntervalSeconds,
        ),
      };

      const axiosConfig: AxiosRequestConfig = {
        params,
        ...(this.authConfig ?? {}),
      };

      const response = await axios.get(url, axiosConfig);
      return response.data;
    } catch (error) {
      this.logger.warn('Cannot fetch events from Frigate', error as Error);
      return undefined;
    }
  }

  async getSnapshotWithRetry(
    eventId: string,
    maxRetries = 3,
    retryDelayMs = 1000,
  ): Promise<Buffer | null> {
    const axiosConfig: AxiosRequestConfig = {
      responseType: 'arraybuffer',
      ...(this.authConfig ?? {}),
    };

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const snapshotUrl = `${this.baseUrl}/api/events/${eventId}/snapshot.jpg`;
        const response = await axios.get(snapshotUrl, axiosConfig);
        this.logger.log(
          `Snapshot fetched for event ${eventId} on attempt ${attempt}`,
        );
        return Buffer.from(response.data);
      } catch (error) {
        if (attempt < maxRetries) {
          this.logger.warn(
            `Failed to fetch snapshot for event ${eventId} (attempt ${attempt}/${maxRetries}), retrying in ${retryDelayMs}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        } else {
          this.logger.error(
            `Failed to fetch snapshot for event ${eventId} after ${maxRetries} attempts.`,
            error as Error,
          );
        }
      }
    }
    return null;
  }

  async getThumbnailWithRetry(
    eventId: string,
    maxRetries = 3,
    retryDelayMs = 1000,
  ): Promise<Buffer | null> {
    const axiosConfig: AxiosRequestConfig = {
      responseType: 'arraybuffer',
      ...(this.authConfig ?? {}),
    };

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const thumbnailUrl = `${this.baseUrl}/api/events/${eventId}/thumbnail.jpg`;
        const response = await axios.get(thumbnailUrl, axiosConfig);

        this.logger.log(
          `Thumbnail fetched for event ${eventId} on attempt ${attempt}`,
        );

        return Buffer.from(response.data);
      } catch (error) {
        if (attempt < maxRetries) {
          this.logger.warn(
            `Failed to fetch thumbnail for event ${eventId} (attempt ${attempt}/${maxRetries}), retrying in ${retryDelayMs}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        } else {
          this.logger.error(
            `Failed to fetch thumbnail for event ${eventId} after ${maxRetries} attempts.`,
            error as Error,
          );
        }
      }
    }

    return null;
  }

  async getPreviewGifWithRetry(
    eventId: string,
    maxRetries = 3,
    retryDelayMs = 1000,
  ): Promise<Buffer | null> {
    const axiosConfig: AxiosRequestConfig = {
      responseType: 'arraybuffer',
      ...(this.authConfig ?? {}),
    };

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const previewUrl = `${this.baseUrl}/api/events/${eventId}/preview.gif`;
        const response = await axios.get(previewUrl, axiosConfig);

        this.logger.log(
          `Preview GIF fetched for event ${eventId} on attempt ${attempt}`,
        );

        return Buffer.from(response.data);
      } catch (error) {
        if (attempt < maxRetries) {
          this.logger.warn(
            `Failed to fetch preview for event ${eventId} (attempt ${attempt}/${maxRetries}), retrying in ${retryDelayMs}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        } else {
          this.logger.error(
            `Failed to fetch preview for event ${eventId} after ${maxRetries} attempts.`,
            error as Error,
          );
        }
      }
    }

    return null;
  }

  async getCameras(): Promise<string[]> {
    try {
      const url = `${this.baseUrl}/api/config`;
      const response = await axios.get(url, this.authConfig ?? {});
      const config = response.data;
      if (config?.cameras) {
        return Object.keys(config.cameras);
      }
      return [];
    } catch (error) {
      this.logger.error('Failed to fetch camera list', error as Error);
      return [];
    }
  }

  async getSnapshot(camera: string): Promise<Buffer | null> {
    try {
      const url = `${this.baseUrl}/api/${camera}/latest.jpg`;
      const axiosConfig: AxiosRequestConfig = {
        responseType: 'arraybuffer',
        ...(this.authConfig ?? {}),
      };
      const response = await axios.get(url, axiosConfig);
      this.logger.log(`Snapshot fetched for camera ${camera}`);
      return Buffer.from(response.data);
    } catch (error) {
      this.logger.error(
        `Failed to fetch snapshot for camera ${camera}`,
        error as Error,
      );
      return null;
    }
  }

  async getClipWithRetry(
    eventId: string,
    maxRetries = 3,
    retryDelayMs = 1000,
  ): Promise<Buffer | null> {
    const axiosConfig: AxiosRequestConfig = {
      responseType: 'arraybuffer',
      ...(this.authConfig ?? {}),
    };

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const clipUrl = `${this.baseUrl}/api/events/${eventId}/clip.mp4`;
        const response = await axios.get(clipUrl, axiosConfig);
        this.logger.log(
          `Clip fetched for event ${eventId} on attempt ${attempt}`,
        );
        return Buffer.from(response.data);
      } catch (error) {
        if (attempt < maxRetries) {
          this.logger.warn(
            `Failed to fetch clip for event ${eventId}, retrying...`,
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        } else {
          this.logger.error(
            `Failed to fetch clip for event ${eventId} after ${maxRetries} attempts.`,
            error,
          );
        }
      }
    }
    return null;
  }

  getMediaBaseUrl(): string {
    return this.mediaUrl;
  }
}
