export interface ConnectLineInput {
  channelId: string;
  channelSecret: string;
  accessToken?: string;
}

export interface LineConnectionView {
  connected: boolean;
  status: 'active' | 'error' | 'inactive' | 'none';
  statusReason: string | null;
  mode: 'real' | 'sandbox';
  channelId: string | null;
  displayName: string | null;
  basicId: string | null;
  addFriendUrl: string | null;
  addFriendQrDataUrl: string | null;
  webhookUrl: string | null;
  hasAccessToken: boolean;
  source: 'ui' | 'env' | null;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  lastEventAt: string | null;
  eventsTotal: number;
  push: {
    month: string;
    calls: number;
    messages: number;
    quotaAlertedAt: string | null;
    lineQuota: { type: string; value: number | null; used: number | null } | null;
  };
}

export interface LineEventRow {
  webhookEventId: string;
  eventType: string;
  messageType: string | null;
  isRedelivery: boolean;
  state: string;
  note: string | null;
  receivedAt: string;
}
