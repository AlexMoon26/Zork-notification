import { Injectable, Logger } from '@nestjs/common';
import { Cam } from 'onvif/promises'; // Используем Cam из promises

export interface OnvifConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

@Injectable()
export class OnvifService {
  private readonly logger = new Logger(OnvifService.name);
  private deviceCache = new Map<string, any>();

  constructor() {}

  private async getDevice(
    cameraName: string,
    onvifConfig: OnvifConfig,
  ): Promise<any> {
    const key = cameraName;
    if (this.deviceCache.has(key)) {
      return this.deviceCache.get(key);
    }
    try {
      const device = new Cam({
        hostname: onvifConfig.host,
        username: onvifConfig.user,
        password: onvifConfig.password,
        port: onvifConfig.port,
      });
      await device.connect();
      this.deviceCache.set(key, device);
      this.logger.log(`ONVIF device initialized for camera ${cameraName}`);
      return device;
    } catch (error) {
      this.logger.error(
        `Failed to initialize ONVIF device for camera ${cameraName}`,
        error,
      );
      throw error;
    }
  }

  async getPresets(
    cameraName: string,
    onvifConfig: OnvifConfig,
  ): Promise<Array<{ token: string; name: string }>> {
    try {
      const device = await this.getDevice(cameraName, onvifConfig);
      const presetsObj = await device.getPresets();
      const presetsArray = Object.values(presetsObj).map((p: any) => ({
        token: String(p.$.token),
        name: p.name,
      }));
      return presetsArray;
    } catch (error) {
      this.logger.error(
        `Failed to get presets for camera ${cameraName}`,
        error,
      );
      return [];
    }
  }

  async gotoPreset(
    cameraName: string,
    onvifConfig: OnvifConfig,
    presetName: string,
  ): Promise<boolean> {
    try {
      const device = await this.getDevice(cameraName, onvifConfig);
      if (typeof device.gotoPreset === 'function') {
        await device.gotoPreset({ preset: presetName });
        this.logger.log(`Camera ${cameraName} moved to preset "${presetName}"`);
        return true;
      } else {
        this.logger.warn(`gotoPreset not available for camera ${cameraName}`);
        return false;
      }
    } catch (error) {
      this.logger.error(
        `Failed to goto preset "${presetName}" for camera ${cameraName}`,
        error,
      );
      return false;
    }
  }
}
