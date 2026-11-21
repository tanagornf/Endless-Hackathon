import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import i18n, { i18nReady } from '../i18n';
import { DataTable } from './DataTable';
import { StatusChip } from './StatusChip';

beforeAll(async () => { await i18nReady; await i18n.changeLanguage('th'); });
afterEach(cleanup);

test('renders an empty translation, then exposes clickable table rows', () => {
  const columns = [{ key: 'name', header: 'Name' }];
  const rows = [{ id: '1', name: 'First' }, { id: '2', name: 'Second' }];
  const onRowClick = vi.fn();
  const view = render(<DataTable columns={columns} rows={[]} rowKey={(row: { id: string }) => row.id} />);
  expect(screen.getByText('ยังไม่มีข้อมูล')).toBeDefined();
  view.rerender(<DataTable columns={columns} rows={rows} rowKey={(row) => row.id} onRowClick={onRowClick} />);
  expect(view.container.querySelectorAll('tbody tr')).toHaveLength(2);
  fireEvent.click(screen.getByText('First'));
  expect(onRowClick).toHaveBeenCalledWith(rows[0]);
});

test('translates a known status and shows an unknown status verbatim', () => {
  render(<><StatusChip kind="order" status="paid" /><StatusChip kind="order" status="odd" /></>);
  expect(screen.getByText('ชำระแล้ว').closest('[data-color]')?.getAttribute('data-color')).toBe('success');
  expect(screen.getByText('odd').closest('[data-color]')?.getAttribute('data-color')).toBe('default');
});
