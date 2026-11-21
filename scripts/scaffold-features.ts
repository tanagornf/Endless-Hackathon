import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { FEATURES } from '@nless/shared/core/features';

const menu = [
  [
    "tenancy",
    "/members",
    "settings",
    "สมาชิกและสิทธิ์",
    "Members",
    "account.members",
    "GroupOutlined"
  ],
  [
    "business-settings",
    "/business",
    "settings",
    "ข้อมูลร้าน",
    "Business",
    "business.read",
    "StorefrontOutlined"
  ],
  [
    "knowledge",
    "/knowledge",
    "knowledge",
    "คลังความรู้",
    "Knowledge",
    "product.read",
    "MenuBookOutlined"
  ],
  [
    "knowledge-import",
    "/imports",
    "knowledge",
    "นำเข้าข้อมูล",
    "Imports",
    "product.write",
    "UploadFileOutlined"
  ],
  [
    "knowledge-search",
    "/knowledge-search",
    "knowledge",
    "ทดสอบการค้นหา",
    "Search test",
    "product.read",
    "ManageSearchOutlined"
  ],
  [
    "catalog",
    "/catalog",
    "knowledge",
    "สินค้าและบริการ",
    "Catalog",
    "product.read",
    "Inventory2Outlined"
  ],
  [
    "inbox",
    "/chat",
    "chat",
    "แชต",
    "Chat",
    "chat.read",
    "ForumOutlined"
  ],
  [
    "inbox",
    "/demo-chat",
    "ai",
    "Demo Chat",
    "Demo Chat",
    "insights.demo",
    "SmartToyOutlined"
  ],
  [
    "ai-agent",
    "/ai-settings",
    "ai",
    "ตั้งค่า AI",
    "AI settings",
    "business.bot_settings",
    "TuneOutlined"
  ],
  [
    "team",
    "/team",
    "settings",
    "ทีมและตารางงาน",
    "Team",
    "chat.read",
    "BadgeOutlined"
  ],
  [
    "message-templates",
    "/templates",
    "knowledge",
    "ข้อความสำเร็จรูป",
    "Templates",
    "chat.reply",
    "TextSnippetOutlined"
  ],
  [
    "orders",
    "/orders",
    "commerce",
    "ออเดอร์",
    "Orders",
    "orders.read",
    "ReceiptLongOutlined"
  ],
  [
    "payments",
    "/payments",
    "commerce",
    "การชำระเงิน",
    "Payments",
    "orders.read",
    "PaymentsOutlined"
  ],
  [
    "booking",
    "/appointments",
    "commerce",
    "นัดหมาย",
    "Appointments",
    "appointments.read",
    "EventAvailableOutlined"
  ],
  [
    "calendar",
    "/calendar",
    "commerce",
    "Google Calendar",
    "Google Calendar",
    "appointments.settings",
    "CalendarMonthOutlined"
  ],
  [
    "line",
    "/channels",
    "settings",
    "ช่องทาง",
    "Channels",
    "business.channels",
    "HubOutlined"
  ],
  [
    "meta",
    "/channels/meta",
    "settings",
    "Facebook / Instagram",
    "Facebook / Instagram",
    "business.channels",
    "FacebookOutlined"
  ],
  [
    "comments",
    "/comment-replies",
    "live",
    "ตอบคอมเมนต์",
    "Comment replies",
    "business.channels",
    "CommentOutlined"
  ],
  [
    "live-commerce",
    "/product-codes",
    "live",
    "รหัสสินค้าไลฟ์",
    "Live product codes",
    "product.read",
    "QrCode2Outlined"
  ],
  [
    "broadcast",
    "/broadcast",
    "customers",
    "บรอดแคสต์",
    "Broadcast",
    "broadcast.read",
    "CampaignOutlined"
  ],
  [
    "crm",
    "/customers",
    "customers",
    "ลูกค้า",
    "Customers",
    "chat.read",
    "PeopleAltOutlined"
  ],
  [
    "insights",
    "/insights",
    "insights",
    "อินไซต์",
    "Insights",
    "insights.read",
    "InsightsOutlined"
  ],
  [
    "analytics",
    "/dashboard",
    "home",
    "แดชบอร์ดและต้นทุน",
    "Dashboard & cost",
    "insights.read",
    "DashboardOutlined"
  ],
  [
    "voice",
    "/voice",
    "ai",
    "Demo Voice",
    "Demo Voice",
    "insights.demo",
    "MicOutlined"
  ],
  [
    "evals",
    "/ai-quality",
    "insights",
    "คุณภาพ AI",
    "AI quality",
    "insights.read",
    "FactCheckOutlined"
  ],
  [
    "follow-ups",
    "/follow-ups",
    "customers",
    "ติดตามลูกค้า",
    "Follow-ups",
    "chat.read",
    "ScheduleSendOutlined"
  ],
  [
    "chatgpt-catalog",
    "/chatgpt-catalog",
    "knowledge",
    "แค็ตตาล็อกสำหรับ ChatGPT",
    "ChatGPT catalog",
    "product.read",
    "ShoppingBagOutlined"
  ],
  [
    "notifications",
    "/notifications",
    "help",
    "การแจ้งเตือน",
    "Notifications",
    "",
    "NotificationsOutlined"
  ],
  [
    "release",
    "/release",
    "admin",
    "Release",
    "Release",
    "",
    "RocketLaunchOutlined"
  ]
] as const;
const targetModes = {
  "F01": "R",
  "F02": "R",
  "F03": "R",
  "F04": "R",
  "F05": "R",
  "F06": "S",
  "F07": "R",
  "F08": "R",
  "F09": "R",
  "F10": "R",
  "F11": "R",
  "F12": "S",
  "F13": "R",
  "F14": "S",
  "F15": "R",
  "F16": "S",
  "F17": "S",
  "F18": "R",
  "F21": "S",
  "F22": "S",
  "F23": "S",
  "F24": "R",
  "F26": "R",
  "F27": "R",
  "F30": "S",
  "F31": "S",
  "F35": "R",
  "F36": "R",
  "F37": "R",
  "F38": "R",
  "F39": "R"
} as const;

function writeNew(path: string, text: string) {
  const file = resolve(import.meta.dirname, '..', path);
  mkdirSync(dirname(file), { recursive: true });
  try {
    writeFileSync(file, text, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
}
const literal = JSON.stringify;

for (const feature of FEATURES) {
  if (!feature.folder) continue;
  const { id, slug, lane } = feature;
  const server = 'server/src/features/' + slug;
  const web = 'web/src/features/' + slug;
  const shared = 'shared/features/' + slug;
  const entries = menu.filter((row) => row[0] === slug);
  const initial = entries[0];
  const statusPath = '/features/' + slug + '/status';
  writeNew(server + '/routes.ts', [
    "import { defineFeatureRoutes } from '../../core';",
    ...(slug === 'ai-agent' ? ["import { AI_REPLY_JOB } from '@nless/shared/features/inbox/types';", "import { aiReplyJobHandler } from './service';"] : []),
    '',
    'export default defineFeatureRoutes({',
    '  featureId: ' + literal(id) + ',',
    '  slug: ' + literal(slug) + ',',
    '  register(api) {',
    '    api.get(' + literal(statusPath) + ", { auth: 'user', summary: 'placeholder status' }, async () => (" + literal({ featureId: id, slug, lane, implemented: false, mode: 'U' }) + '));',
    '  },',
    ...(slug === 'ai-agent' ? ['  jobs: { [AI_REPLY_JOB]: aiReplyJobHandler },'] : []),
    '});', '',
  ].join('\n'));
  writeNew(server + '/service.ts', 'export const FEATURE = ' + literal({ id, slug, lane }) + ' as const;\n');
  writeNew(server + '/migrations/.gitkeep', '');
  writeNew(shared + '/types.ts', '// ' + id + ' ' + slug + ' types are owned by ' + lane + '.\nexport {};\n');
  writeNew(server + '/EVIDENCE.md', '# ' + id + ' ' + slug + '\n\n| ID | Status | Target mode | Actual mode |\n|---|---|---|---|\n| ' + id + ' | UNIMPLEMENTED | ' + (targetModes[id as keyof typeof targetModes] ?? 'R') + ' | U |\n\n## Log\n');
  const fallback = initial ? [initial[3], initial[4]] : [feature.title, feature.title];
  const admin = slug === 'release';
  const routeLines = feature.webPaths.map((path) => {
    const entry = entries.find((row) => path === row[1]);
    const extra = slug === 'auth' ? "auth: 'none', layout: 'public', " :
      admin ? "auth: 'platform_admin', " : slug === 'notifications' || path === '/onboarding' ? "auth: 'user', " : '';
    const permission = entry?.[5] ?? entries[0]?.[5];
    const needed = permission && permission.includes('.') ? 'permission: ' + literal(permission) + ', ' : '';
    return '    { path: ' + literal(path) + ', ' + extra + needed + 'load: () => import("./Placeholder") },';
  });
  const menuLines = entries.flatMap((row, index) => {
    const [, path, group, , , permission, icon] = row;
    if (!group) return [];
    const label = slug + ':menu.' + (index === 0 ? 'title' : 'entry' + index);
    const needed = permission && permission.includes('.') ? ', permission: ' + literal(permission) : '';
    return ['    { path: ' + literal(path) + ', group: ' + literal(group) + ', labelKey: ' + literal(label) + ', icon: ' + literal(icon) +
      ', order: ' + (menu.findIndex((entry) => entry === row) + 1) * 10 + needed + (admin ? ', platformAdminOnly: true' : '') + ' },'];
  });
  writeNew(web + '/pages.tsx', [
    "import { defineFeaturePages } from '../../core';", '', 'export default defineFeaturePages({',
    '  featureId: ' + literal(id) + ',', '  slug: ' + literal(slug) + ',', '  routes: [', ...routeLines,
    '  ],', '  menu: [', ...menuLines, '  ],', '});', '',
  ].join('\n'));
  writeNew(web + '/Placeholder.tsx', [
    "import { PlaceholderPage } from '../../core';", '', 'export default function Placeholder() {',
    '  return <PlaceholderPage featureId="' + id + '" />;', '}', '',
  ].join('\n'));
  for (const [index, language] of ['th', 'en'].entries()) {
    const title = fallback[index];
    const translations = Object.fromEntries(entries.map((row, rowIndex) => [rowIndex ? 'entry' + rowIndex : 'title', row[3 + index]]));
    writeNew(web + '/i18n/' + language + '.json', JSON.stringify({ menu: { title, ...translations }, page: { title } }, null, 2) + '\n');
  }
}
writeNew('server/src/features/evals/run.ts', "console.log('F37 ยังไม่ทำ');\n");
