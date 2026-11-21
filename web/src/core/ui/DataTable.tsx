import { LinearProgress, Paper, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { DataTableProps } from '../types';
import { EmptyState } from './EmptyState';

export function DataTable<T>({ columns, rows, rowKey, loading, empty, onRowClick }: DataTableProps<T>) {
  const { t } = useTranslation('common');
  return <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
    {loading && <LinearProgress />}
    <Table size="small" aria-busy={Boolean(loading)}>
      <TableHead><TableRow>{columns.map((column) =>
        <TableCell key={column.key} align={column.align} sx={{ whiteSpace: 'nowrap', width: column.width }}>{column.header}</TableCell>
      )}</TableRow></TableHead>
      <TableBody>
        {loading && !rows.length && [0, 1, 2].map((row) => <TableRow key={row}>{columns.map((column) =>
          <TableCell key={column.key}><Skeleton /></TableCell>)}</TableRow>)}
        {!loading && !rows.length && <TableRow><TableCell colSpan={Math.max(1, columns.length)}>{empty ?? <EmptyState title={t('table.empty')} />}</TableCell></TableRow>}
        {rows.map((row) => <TableRow key={rowKey(row)} hover={Boolean(onRowClick)} tabIndex={onRowClick ? 0 : undefined}
          sx={{ cursor: onRowClick ? 'pointer' : undefined }} onClick={onRowClick ? () => onRowClick(row) : undefined}
          onKeyDown={onRowClick ? (event) => {
            if ((event.key === 'Enter' || event.key === ' ') && event.currentTarget === event.target) { event.preventDefault(); onRowClick(row); }
          } : undefined}>
          {columns.map((column) => <TableCell key={column.key} align={column.align}>
            {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? '—')}
          </TableCell>)}
        </TableRow>)}
      </TableBody>
    </Table>
  </TableContainer>;
}
