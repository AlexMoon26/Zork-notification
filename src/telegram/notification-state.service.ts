import { Injectable } from '@nestjs/common';

@Injectable()
export class NotificationStateService {
  private readonly enabledMap = new Map<number, boolean>();
  private lastCameraMessageIds = new Map<number, number>();

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
}
