import type { ApiFailure, RealtimeEvent } from '@nless/shared/core/types';
import type { SessionState, SlotContribution, SlotName, WebApiClient } from '@nless/shared/core/loader';
import type { PermissionKey } from '@nless/shared/core/permissions';
import type { ReactNode } from 'react';

export interface DataTableColumn<T> {
  /** Unique per table. Without `render` the cell shows `row[key]` (null/undefined → '—'). */
  key: string;
  /** Already translated, e.g. t('catalog:table.name'). */
  header: string;
  render?: (row: T) => ReactNode;
  width?: number | string;
  /** Default 'left'; money/number columns 'right'. Applies to header and cells. */
  align?: 'left' | 'right' | 'center';
}

/**
 * MUI Table (size small) in an outlined Paper. TableContainer overflowX auto + nowrap headers: on phones the table
 * scrolls horizontally instead of squeezing columns. No built-in sort/paging (pass sorted rows, e.g. Page<T>.items;
 * put "load more" below the table).
 * loading → LinearProgress above the header + aria-busy; no rows yet → 3 skeleton rows.
 * !loading && rows = [] → one full-width row: `empty` ?? <EmptyState title={t('common:table.empty')} /> ('ยังไม่มีข้อมูล').
 * onRowClick → hover style, pointer cursor, tabIndex 0, Enter/Space = click.
 */
export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
}

/**
 * Create/edit form in a Dialog: fullWidth, maxWidth 'sm', fullScreen below 'sm'; aria-labelledby = title.
 * Fields = MUI inputs passed as children (stacked, spacing 2; the caller puts autoFocus on the first one).
 * Content sits in <form noValidate>: Enter or the submit button → onSubmit (preventDefault).
 * Buttons: cancel (common:actions.cancel 'ยกเลิก') → onClose · submit (submitLabel ?? common:actions.save 'บันทึก').
 * submitting → both buttons disabled + spinner on submit; Esc/backdrop do nothing.
 * error → Alert severity 'error' above the fields (form-level text; API errors are already toasted by useApiMutation).
 * Never closes itself: the caller closes after success. A rejected onSubmit is swallowed and the dialog stays open.
 */
export interface FormDialogProps {
  open: boolean;
  title: string;
  submitLabel?: string;
  submitting?: boolean;
  error?: string | null;
  onSubmit: () => void | Promise<void>;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Yes/no Dialog: maxWidth 'xs', fullWidth (stays compact on phones: a two-line question needs no full screen).
 * message in DialogContentText. confirmLabel ?? (danger ? common:actions.delete 'ลบ' : common:actions.confirm 'ยืนยัน');
 * cancel = common:actions.cancel. danger → confirm button color 'error' and initial focus on cancel.
 * Awaits onConfirm with its own pending state (both buttons disabled + spinner) → resolved: calls onClose() ·
 * rejected: stays open (useApiMutation already toasted).
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

/** Centered block (py 6): icon (default InboxOutlined, text.secondary) · title · description (body2, text.secondary) · action (e.g. a create Button). */
export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export type StatusChipKind = 'feature' | 'order' | 'payment' | 'conversation' | 'generic';

/** MUI Chip `color`. */
export type StatusChipColor = 'default' | 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error';

/**
 * Chip size small. kind default 'generic'. Colour from the map below (status not in the map → 'default'), also rendered
 * as `data-color={color}` for tests. Text = label ?? t(`common:status.<kind>.<status>`, { defaultValue: status }).
 * Map (status colour 'Thai label'; common.json en gets the English pair):
 *   feature (AGENTS.md §9): R success 'จริง (R)' · S info 'Sandbox (S)' · A warning 'Adapter (A)' · U default 'ยังไม่ทำ (U)'
 *   order (OrderSummary.status): awaiting_payment warning 'รอชำระเงิน' · paid success 'ชำระแล้ว' · preparing info 'กำลังเตรียม' ·
 *     shipped primary 'จัดส่งแล้ว' · delivered success 'ส่งถึงแล้ว' · cancelled default 'ยกเลิก'
 *   payment (OrderSummary.paymentState): unpaid warning 'ยังไม่ชำระ' · pending_verification info 'รอตรวจสลิป' ·
 *     paid success 'ชำระแล้ว' · refunded default 'คืนเงินแล้ว'
 *   conversation (ConversationRecord.status / .handler): open info 'เปิดอยู่' · closed default 'ปิดแล้ว' ·
 *     ai secondary 'AI ตอบ' · human warning 'พนักงานตอบ'
 *   generic (JobState, KnowledgeStatus, KnowledgeIndexState, DeliveryState, AppointmentSummary.status, …):
 *     active success 'ใช้งาน' · ready success 'พร้อม' · sent success 'ส่งแล้ว' · succeeded success 'สำเร็จ' ·
 *     completed success 'เสร็จแล้ว' · running info 'กำลังทำ' · indexing info 'กำลังทำดัชนี' · reviewed info 'ตรวจแล้ว' ·
 *     booked info 'จองแล้ว' · draft warning 'ร่าง' · pending warning 'รอดำเนินการ' · queued warning 'รอคิว' ·
 *     not_started warning 'ยังไม่เริ่ม' · unknown warning 'ไม่ทราบผล' · no_show warning 'ไม่มาตามนัด' · failed error 'ล้มเหลว' ·
 *     dead error 'ล้มเหลวถาวร' · inactive default 'ปิดใช้งาน' · deleted default 'ลบแล้ว' · cancelled default 'ยกเลิก' ·
 *     not_required default 'ไม่ต้องส่ง'
 */
export interface StatusChipProps {
  status: string;
  kind?: StatusChipKind;
  label?: string;
}

/** Card variant 'outlined'. title → CardHeader (title h6, actions right; below 'sm' actions wrap under the title). Children in CardContent. */
export interface SectionCardProps {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Mounted ONCE by core in main.tsx (inside ThemeProvider, around the router). Features never mount it.
 * One Snackbar + Alert at a time, FIFO queue; success/info auto-hide 3 s, error 6 s; close button; Alert role="alert".
 */
export interface ToastProviderProps {
  children: ReactNode;
}

/**
 * Messages are already-translated strings. error(err): string → as is · ApiFailure (or WebApiError → its .failure) →
 * t(`common:errors.<code>`, { defaultValue: error.message }) + console.warn(code, requestId) · anything else →
 * t('common:errors.generic') ('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง'). Outside a ToastProvider (feature unit tests) → no-op +
 * console.warn, never throws.
 */
export interface ToastApi {
  success(msg: string): void;
  error(err: string | ApiFailure | unknown): void;
  info(msg: string): void;
}

export interface ApiQueryOptions {
  /** Set false when the endpoint itself authorizes the resource, such as a conversation ID. Default true. */
  businessScoped?: boolean;
  /** Extra values that trigger a refetch when they change (path and the current business id already do). */
  deps?: unknown[];
}

export interface ApiQueryState<T> {
  data: T | undefined;
  error: ApiFailure | null;
  loading: boolean;
  reload: () => void;
}

export type ApiMutationMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiMutationOptions {
  /** Set false when the endpoint itself authorizes the resource, such as a conversation ID. Default true. */
  businessScoped?: boolean;
  /** Default true: a failure calls useToast().error(failure) before run() rejects. */
  toastOnError?: boolean;
}

export interface ApiMutationState<I, O> {
  run: (input: I) => Promise<O>;
  running: boolean;
  error: ApiFailure | null;
}

/** Everything a feature page imports from web/src/core (index.ts), besides PageHeader / PlaceholderPage / RequirePermission / defineFeaturePages. */
export interface WebCore {
  api: WebApiClient;
  useSession(): SessionState;
  useCan(key: PermissionKey): boolean;
  /** Subscribe to realtime events of the current business. Returns nothing; unsubscribes on unmount. */
  useRealtime<T extends RealtimeEvent['type']>(type: T, handler: (event: Extract<RealtimeEvent, { type: T }>) => void): void;
  useSlot(slot: SlotName): SlotContribution[];
  /** Format integer minor units: formatMoney(149000) → '฿1,490'. */
  formatMoney(minor: number, currency?: 'THB'): string;
  /** ISO UTC → Asia/Bangkok display in the UI language. */
  formatDateTime(iso: string, opts?: { dateOnly?: boolean }): string;
  // ---- UI kit (web/src/core/ui/*), behaviour in the JSDoc above ----
  DataTable<T>(props: DataTableProps<T>): ReactNode;
  FormDialog(props: FormDialogProps): ReactNode;
  ConfirmDialog(props: ConfirmDialogProps): ReactNode;
  EmptyState(props: EmptyStateProps): ReactNode;
  StatusChip(props: StatusChipProps): ReactNode;
  SectionCard(props: SectionCardProps): ReactNode;
  ToastProvider(props: ToastProviderProps): ReactNode;
  useToast(): ToastApi;
  useApiQuery<T>(path: string | null, opts?: ApiQueryOptions): ApiQueryState<T>;
  useApiMutation<I, O>(method: ApiMutationMethod, path: string | ((input: I) => string), opts?: ApiMutationOptions): ApiMutationState<I, O>;
}
