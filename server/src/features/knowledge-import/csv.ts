import { parse } from 'csv-parse/sync';
import { AppError } from '../../core/errors';
import { truncateCodePoints } from './decode';

const delimiters = [',', ';', '\t'] as const;
export type CsvDelimiter = (typeof delimiters)[number];

const maxRows = 2_000;
const maxColumns = 30;
const maxCellChars = 500;

export interface ParsedCsv {
  delimiter: CsvDelimiter;
  header: string[];
  rows: { rowNo: number; raw: string[] }[];
}

function detectDelimiter(text: string): CsvDelimiter {
  const counts: Record<CsvDelimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  let headerStarted = false;
  for (const char of text) {
    if (!quoted && (char === '\n' || char === '\r')) {
      if (headerStarted) break;
      counts['\t'] = 0;
      continue;
    }
    if (char.trim()) headerStarted = true;
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === ',' || char === ';' || char === '\t')) counts[char]++;
  }
  return delimiters.reduce<CsvDelimiter>((best, char) => counts[char] > counts[best] ? char : best, ',');
}

export function parseCsv(text: string, options: { delimiter?: CsvDelimiter } = {}): ParsedCsv {
  const delimiter = options.delimiter ?? detectDelimiter(text);
  const header: string[] = [];
  const rows: ParsedCsv['rows'] = [];
  try {
    parse(text, {
      bom: true, delimiter, skip_empty_lines: true, relax_quotes: true, relax_column_count: true,
      on_record(record: string[], info) {
        if (record.every((cell) => !cell.trim())) return null;
        const cells = record.slice(0, maxColumns).map((cell) => truncateCodePoints(cell, maxCellChars));
        if (!header.length) header.push(...cells);
        else {
          if (rows.length >= maxRows) {
            throw new AppError('VALIDATION_ERROR', 'CSV contains more than 2,000 data rows', { details: { reason: 'too_many_rows' } });
          }
          // Logical spreadsheet rows include blank records. A quoted newline stays inside its cell.
          rows.push({ rowNo: info.records + info.empty_lines, raw: cells });
        }
        return null;
      },
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('VALIDATION_ERROR', 'Could not parse CSV', { details: { reason: 'csv_unparsable' } });
  }
  if (!rows.length) throw new AppError('VALIDATION_ERROR', 'CSV has no data rows', { details: { reason: 'empty_file' } });
  return { header, rows, delimiter };
}
