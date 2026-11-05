import type { Vehicle, ManualOverride } from '../engine/types';

export interface SyncPayload {
  vehicles: Vehicle[];
  ruleWeights: Record<string, number>;
  closedStops: string[];
  manualOverrides: Record<string, ManualOverride>;
  updatedAt: number;
}

const CHANNEL_NAME = 'stranded_network_sync_channel';
const STORAGE_KEY = 'stranded_network_latest_state';

class NetworkSyncManager {
  private channel: BroadcastChannel | null = null;
  private listeners: Array<(payload: SyncPayload) => void> = [];

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (event) => {
          if (event.data && event.data.type === 'SYNC_STATE') {
            const payload: SyncPayload = event.data.payload;
            this.notifyListeners(payload);
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel error:', err);
      }
    }

    // Storage fallback for cross-tab sync
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEY && event.newValue) {
          try {
            const payload: SyncPayload = JSON.parse(event.newValue);
            this.notifyListeners(payload);
          } catch {
            // ignore JSON parse error
          }
        }
      });
    }
  }

  public broadcast(payload: SyncPayload) {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // quota exceeded or disabled
      }
    }

    if (this.channel) {
      try {
        this.channel.postMessage({
          type: 'SYNC_STATE',
          payload,
        });
      } catch (err) {
        console.error('BroadcastChannel postMessage error:', err);
      }
    }
  }

  public getSavedState(): SyncPayload | null {
    if (typeof window === 'undefined') return null;
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  public subscribe(callback: (payload: SyncPayload) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notifyListeners(payload: SyncPayload) {
    for (const listener of this.listeners) {
      listener(payload);
    }
  }
}

export const syncManager = new NetworkSyncManager();
