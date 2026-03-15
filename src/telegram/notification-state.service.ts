import { Injectable } from '@nestjs/common';

@Injectable()
export class NotificationStateService {
  private readonly enabledMap = new Map<number, boolean>();
  private lastCameraMessageIds = new Map<number, number>();
  private presetsMap = new Map<
    string,
    Array<{ token: string; name: string }>
  >();

  isEnabled(chatId: number): boolean {
    return this.enabledMap.get(chatId) ?? true;
  }

  setEnabled(chatId: number, enabled: boolean): void {
    this.enabledMap.set(chatId, enabled);
  }
  setLastCameraMessageId(chatId: number, messageId: number): void {
    this.lastCameraMessageIds.set(chatId, messageId);
  }

  getLastCameraMessageId(chatId: number): number | undefined {
    return this.lastCameraMessageIds.get(chatId);
  }

  clearLastCameraMessageId(chatId: number): void {
    this.lastCameraMessageIds.delete(chatId);
  }

  setPresets(camera: string, presets: Array<{ token: string; name: string }>) {
    this.presetsMap.set(camera, presets);
  }

  getPresets(
    camera: string,
  ): Array<{ token: string; name: string }> | undefined {
    return this.presetsMap.get(camera);
  }

  clearPresets(camera: string) {
    this.presetsMap.delete(camera);
  }
}
