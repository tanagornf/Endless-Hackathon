import type { FeatureId } from '@nless/shared/core/features';
import type { MenuGroup, PageRoute } from '@nless/shared/core/loader';
import type { PermissionKey } from '@nless/shared/core/permissions';

export interface Panel {
  label: string;
  endpoint: string;
  /** null displays a summary, an empty string a root array, otherwise a nested list. */
  rows: string | null;
  /** Space-separated property paths with optional translated field keys after a colon. */
  fields: string;
  permission?: PermissionKey;
}
export interface Screen {
  id: FeatureId;
  key: string;
  path: string;
  group?: MenuGroup;
  icon?: string;
  permission?: PermissionKey;
  auth?: PageRoute['auth'];
  layout?: PageRoute['layout'];
  global?: boolean;
  panels: Panel[];
}
export const screens: Screen[] = [
  { id: "F27", key: "dashboard", path: "/dashboard", group: "home", icon: "DashboardOutlined", permission: "insights.read",
    panels: [
      { label: "overview", endpoint: "/analytics/dashboard", rows: null, fields: "conversations.active:conversations now.waitingForStaff:waiting messages.ai:replies conversations.newCustomers:newCustomers" },
      { label: "activity", endpoint: "/analytics/dashboard", rows: "daily", fields: "date conversations customerMessages aiReplies staffMessages" },
      { label: "channels", endpoint: "/analytics/dashboard", rows: "channels", fields: "channel conversations" },
    ] },
  { id: "F27", key: "usage", path: "/usage", group: "insights", icon: "PaidOutlined", permission: "business.bot_settings",
    panels: [
      { label: "usage", endpoint: "/analytics/usage", rows: "rows", fields: "featureLabel:feature calls knownUsdMicros:usdMicros" },
    ] },
  { id: "F27", key: "traces", path: "/traces", group: "insights", icon: "AccountTreeOutlined", permission: "business.bot_settings",
    panels: [
      { label: "history", endpoint: "/analytics/traces", rows: "items", fields: "turnId state intent latencyMs" },
    ] },
  { id: "F09", key: "inbox", path: "/chat", group: "chat", icon: "ForumOutlined", permission: "chat.read",
    panels: [
      { label: "conversations", endpoint: "/conversations", rows: "items", fields: "customerName channel lastMessagePreview:lastMessage unreadCount lastMessageAt" },
    ] },
  { id: "F09", key: "demo", path: "/demo-chat", group: "ai", icon: "SmartToyOutlined", permission: "insights.demo",
    panels: [
      { label: "settings", endpoint: "/demo-chat/settings", rows: null, fields: "enabled publicUrl todayTurns dailyCap" },
    ] },
  { id: "F11", key: "team", path: "/team", group: "chat", icon: "BadgeOutlined", permission: "chat.read",
    panels: [
      { label: "members", endpoint: "/team", rows: "members", fields: "displayName availability openConversations role" },
      { label: "settings", endpoint: "/team/settings", rows: null, fields: "autoAssign idlePolicy idleMinutes autoClose" },
    ] },
  { id: "F24", key: "customers", path: "/customers", group: "customers", icon: "PeopleAltOutlined", permission: "chat.read",
    panels: [
      { label: "customers", endpoint: "/crm/customers", rows: "items", fields: "displayName channel tags lastSeenAt" },
    ] },
  { id: "F24", key: "customer", path: "/customers/:customerId", permission: "chat.read",
    panels: [
      { label: "profile", endpoint: "/crm/customers/:customerId", rows: null, fields: "displayName channel tags contact.email:email lastSeenAt" },
    ] },
  { id: "F23", key: "broadcast", path: "/broadcast", group: "customers", icon: "CampaignOutlined", permission: "broadcast.read",
    panels: [
      { label: "history", endpoint: "/broadcasts", rows: "items", fields: "name status scheduledAt" },
      { label: "audience", endpoint: "/broadcasts/tags", rows: "", fields: "name" },
    ] },
  { id: "F12", key: "templates", path: "/templates", group: "customers", icon: "TextSnippetOutlined", permission: "chat.read",
    panels: [
      { label: "templates", endpoint: "/templates", rows: "", fields: "name altText updatedAt" },
    ] },
  { id: "F05", key: "knowledge", path: "/knowledge", group: "knowledge", icon: "MenuBookOutlined", permission: "product.read",
    panels: [
      { label: "entries", endpoint: "/knowledge/items", rows: "items", fields: "title status updatedAt" },
    ] },
  { id: "F06", key: "imports", path: "/imports", group: "knowledge", icon: "UploadFileOutlined", permission: "product.read",
    panels: [
      { label: "history", endpoint: "/imports", rows: "items", fields: "sourceLabel kind state createdAt" },
    ] },
  { id: "F06", key: "importDetail", path: "/imports/:importId", permission: "product.read",
    panels: [
      { label: "rows", endpoint: "/imports/:importId/rows", rows: "items", fields: "rowNo status error" },
    ] },
  { id: "F07", key: "search", path: "/knowledge-search", group: "knowledge", icon: "ManageSearchOutlined", permission: "product.read",
    panels: [
      { label: "index", endpoint: "/knowledge-search/status", rows: null, fields: "mode embedModel chunkCount counts.ready:ready counts.failed:failed" },
      { label: "history", endpoint: "/knowledge-search/eval/runs", rows: "items", fields: "createdAt id" },
    ] },
  { id: "F08", key: "catalog", path: "/catalog", group: "knowledge", icon: "Inventory2Outlined", permission: "product.read",
    panels: [
      { label: "products", endpoint: "/catalog/items", rows: "items", fields: "name sku priceMinor stock" },
    ] },
  { id: "F39", key: "feed", path: "/chatgpt-catalog", group: "knowledge", icon: "ShoppingBagOutlined", permission: "product.read",
    panels: [
      { label: "settings", endpoint: "/chatgpt-catalog/settings", rows: null, fields: "feedEnabled mcpEnabled" },
      { label: "products", endpoint: "/chatgpt-catalog/preview", rows: "rows", fields: "item_id:itemId title price" },
      { label: "excluded", endpoint: "/chatgpt-catalog/preview", rows: "excluded", fields: "sku name reason" },
    ] },
  { id: "F10", key: "agent", path: "/ai-settings", group: "ai", icon: "TuneOutlined", permission: "chat.read",
    panels: [
      { label: "turns", endpoint: "/ai/turns", rows: "items", fields: "state intent latencyMs" },
      { label: "metrics", endpoint: "/ai/metrics", rows: null, fields: "turns completed medianLatencyMs" },
    ] },
  { id: "F37", key: "quality", path: "/ai-quality", group: "ai", icon: "FactCheckOutlined", permission: "insights.read",
    panels: [
      { label: "runs", endpoint: "/ai-quality/runs", rows: "items", fields: "mode score costUsd" },
      { label: "cases", endpoint: "/ai-quality/cases", rows: "items", fields: "id category" },
    ] },
  { id: "F38", key: "follow", path: "/follow-ups", group: "ai", icon: "ScheduleSendOutlined", permission: "chat.read",
    panels: [
      { label: "history", endpoint: "/follow-ups", rows: "items", fields: "customerName productName scheduledFor state" },
      { label: "metrics", endpoint: "/follow-ups/summary", rows: null, fields: "scheduled sent recoveryRate" },
      { label: "settings", endpoint: "/follow-ups/settings", rows: null, fields: "enabled delayHours allowedChannels" },
    ] },
  { id: "F30", key: "voice", path: "/voice", group: "ai", icon: "MicOutlined", permission: "chat.read",
    panels: [
      { label: "conversations", endpoint: "/conversations", rows: "items", fields: "customerName channel lastMessageAt" },
    ] },
  { id: "F30", key: "call", path: "/call", group: "ai", icon: "MicOutlined", permission: "chat.reply",
    panels: [
      { label: "conversations", endpoint: "/conversations", rows: "items", fields: "customerName channel lastMessageAt" },
    ] },
  { id: "F13", key: "orders", path: "/orders", group: "commerce", icon: "ReceiptLongOutlined", permission: "orders.read",
    panels: [
      { label: "orders", endpoint: "/orders", rows: "items", fields: "orderNumber customerName totalMinor status createdAt" },
    ] },
  { id: "F14", key: "payments", path: "/payments", group: "commerce", icon: "PaymentsOutlined", permission: "orders.read",
    panels: [
      { label: "payments", endpoint: "/payments", rows: "items", fields: "orderNumber amountMinor state expiresAt" },
    ] },
  { id: "F15", key: "booking", path: "/appointments", group: "commerce", icon: "EventAvailableOutlined", permission: "appointments.read",
    panels: [
      { label: "appointments", endpoint: "/booking/appointments", rows: "items", fields: "customerName serviceName resourceName startAt status" },
    ] },
  { id: "F16", key: "calendar", path: "/calendar", group: "commerce", icon: "CalendarMonthOutlined", permission: "appointments.settings",
    panels: [
      { label: "connection", endpoint: "/calendar/status", rows: null, fields: "connection.status:status connection.calendarName:calendarName counts.failed:failed" },
      { label: "calendars", endpoint: "/calendar/calendars", rows: "items", fields: "name timezone id" },
    ] },
  { id: "F22", key: "codes", path: "/product-codes", group: "live", icon: "QrCode2Outlined", permission: "product.read",
    panels: [
      { label: "products", endpoint: "/product-codes", rows: "items", fields: "code itemName unitPriceMinor" },
    ] },
  { id: "F22", key: "live", path: "/live", group: "live", icon: "LiveTvOutlined", permission: "product.read",
    panels: [
      { label: "session", endpoint: "/live/sessions/current", rows: null, fields: "title state startedAt" },
      { label: "products", endpoint: "/live/presentation", rows: "codes", fields: "code itemName unitPriceMinor" },
    ] },
  { id: "F22", key: "present", path: "/live/present", permission: "product.read", layout: 'bare',
    panels: [
      { label: "products", endpoint: "/live/presentation", rows: "codes", fields: "code itemName unitPriceMinor" },
    ] },
  { id: "F21", key: "comments", path: "/comment-replies", group: "live", icon: "CommentOutlined", permission: "chat.read",
    panels: [
      { label: "rules", endpoint: "/comment-replies/rules", rows: "items", fields: "name channel keywords enabled" },
      { label: "deliveries", endpoint: "/comment-replies/deliveries", rows: "items", fields: "channel ruleName state createdAt" },
      { label: "metrics", endpoint: "/comment-replies/summary", rows: null, fields: "sent pending failed skipped" },
    ] },
  { id: "F26", key: "insights", path: "/insights", group: "insights", icon: "InsightsOutlined", permission: "insights.read",
    panels: [
      { label: "conversations", endpoint: "/insights/conversations", rows: "items", fields: "customerName summary sentiment" },
      { label: "metrics", endpoint: "/insights/overview", rows: null, fields: "analysed followUpOpen" },
    ] },
  { id: "F17", key: "line", path: "/channels", group: "settings", icon: "HubOutlined", permission: "business.read",
    panels: [
      { label: "connection", endpoint: "/channels/line", rows: null, fields: "displayName status mode lastVerifiedAt eventsTotal" },
      { label: "events", endpoint: "/channels/line/events", rows: "items", fields: "eventType state receivedAt", permission: "business.channels" },
    ] },
  { id: "F18", key: "meta", path: "/channels/meta", group: "settings", icon: "FacebookOutlined", permission: "business.read",
    panels: [
      { label: "connection", endpoint: "/channels/meta", rows: null, fields: "facebook.status:facebook instagram.status:instagram mode appConfigured" },
      { label: "events", endpoint: "/channels/meta/events", rows: "items", fields: "channel eventType state receivedAt", permission: "business.channels" },
    ] },
  { id: "F04", key: "business", path: "/business", group: "settings", icon: "StorefrontOutlined", permission: "business.read",
    panels: [
      { label: "profile", endpoint: "/settings", rows: null, fields: "profile.name:name profile.description:description profile.contactEmail:email settings.language:language profile.contactPhone:phone" },
    ] },
  { id: "F04", key: "bot", path: "/bot-settings", group: "settings", icon: "SmartToyOutlined", permission: "business.read",
    panels: [
      { label: "settings", endpoint: "/settings", rows: null, fields: "aiSwitch:enabled aiBlockedReason:reason" },
    ] },
  { id: "F03", key: "members", path: "/members", group: "settings", icon: "GroupOutlined", permission: "account.members",
    panels: [
      { label: "members", endpoint: "/members", rows: "items", fields: "displayName role status lastSeenAt" },
    ] },
  { id: "F03", key: "invitations", path: "/invitations", group: "settings", icon: "GroupOutlined", permission: "account.members",
    panels: [
      { label: "invitations", endpoint: "/invitations", rows: "items", fields: "email status invitedByName expiresAt" },
    ] },
  { id: "F03", key: "shops", path: "/businesses", group: "settings", icon: "StorefrontOutlined", global: true, auth: 'user',
    panels: [
      { label: "shops", endpoint: "/businesses", rows: "items", fields: "name role status" },
    ] },
  { id: "F03", key: "onboarding", path: "/onboarding", global: true, auth: 'user',
    panels: [
      { label: "shops", endpoint: "/businesses", rows: "items", fields: "name role status" },
    ] },
  { id: "F31", key: "notifications", path: "/notifications", group: "help", icon: "NotificationsOutlined", auth: 'user',
    panels: [
      { label: "notifications", endpoint: "/notifications", rows: "items", fields: "title body createdAt readAt" },
    ] },
  { id: "F36", key: "release", path: "/release", group: "admin", icon: "RocketLaunchOutlined", global: true, auth: 'platform_admin',
    panels: [
      { label: "features", endpoint: "/release/status", rows: "rows", fields: "featureId name lane actualMode blocker" },
      { label: "metrics", endpoint: "/release/status", rows: null, fields: "totals.R:real totals.S:sandbox totals.A:adapter totals.U:unimplemented" },
    ] },
  { id: "F35", key: "ops", path: "/ops", group: "admin", icon: "WorkOutlineOutlined", global: true, auth: 'platform_admin',
    panels: [
      { label: "features", endpoint: "/features", rows: "items", fields: "featureId slug visible" },
      { label: "jobs", endpoint: "/ops/jobs", rows: "items", fields: "type state attempts runAt" },
      { label: "schedules", endpoint: "/ops/schedules", rows: "items", fields: "name lastEnqueuedAt" },
      { label: "deliveries", endpoint: "/ops/deliveries", rows: "items", fields: "channel deliveryState createdAt" },
      { label: "build", endpoint: "/ops/build", rows: null, fields: "shortSha env schema modelMode" },
      { label: "routes", endpoint: "/ops/routes", rows: "items", fields: "method path permission" },
      { label: "audit", endpoint: "/ops/audit", rows: "items", fields: "action targetType createdAt" },
    ] },
  { id: "F02", key: "login", path: "/login", layout: 'public', auth: 'none', panels: [] },
  { id: "F02", key: "signup", path: "/signup", layout: 'public', auth: 'none', panels: [] },
  { id: "F02", key: "forgot", path: "/forgot-password", layout: 'public', auth: 'none', panels: [] },
  { id: "F02", key: "reset", path: "/reset-password", layout: 'public', auth: 'none', panels: [] },
  { id: "F09", key: "publicChat", path: "/demo-chat/s/:slug", layout: 'public', auth: 'none', panels: [] },
  { id: "F14", key: "publicPay", path: "/payments/pay/:token", layout: 'public', auth: 'none', panels: [] },
  { id: "F03", key: "invite", path: "/invitations/accept", layout: 'public', auth: 'none', panels: [] },
];
