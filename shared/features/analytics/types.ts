export interface RangeInfo {
  from: string;
  to: string;
  timezone: string;
  fromUtc: string;
  toUtc: string;
}

export interface DailyAnalytics {
  date: string;
  conversations: number;
  customerMessages: number;
  aiReplies: number;
  staffMessages: number;
}

export interface ReplyTiming {
  n: number;
  medianSeconds: number | null;
}

export interface SellerImpact {
  range: RangeInfo;
  computedAt: string;
  activeConversations: number;
  autoResolved: { count: number; pct: number | null };
  handoff: { count: number; ratePct: number | null };
  staffTouched: number;
  firstResponse: { ai: ReplyTiming; staff: ReplyTiming; all: ReplyTiming; unanswered: number };
  orders: { available: false; reason: 'not_built' };
  followUps: { available: false; reason: 'not_built' };
  aiCost: {
    basis: 'openai' | 'none'; calls: number; knownUsdMicros: number | null; unknownRows: number;
    perAutoResolvedUsdMicros: number | null; isEstimate: true;
  };
  staffMinutesSaved: { minutes: number | null; minutesPerConversation: number; isEstimate: true };
}

export interface DashboardData {
  range: RangeInfo;
  computedAt: string;
  conversations: { active: number; customersActive: number; newCustomers: number };
  messages: { customer: number; ai: number; staff: number };
  now: { openConversations: number; waitingForStaff: number };
  daily: DailyAnalytics[];
  hourly: { hour: number; customerMessages: number }[];
  channels: { channel: 'line'; conversations: number }[];
  impact: SellerImpact;
}

export interface AnalyticsSettings { businessId: string; minutesPerConversation: number; version: number }
