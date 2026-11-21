import { config } from '../../core';

export const MAX_BYTES = Math.min(config.UPLOAD_MAX_MB, 5) * 1024 * 1024;
export const CATALOG_CHUNK = 500;
export const PARSER_VERSION = 'f06-1';
export const IMPORT_JOB = 'knowledge-import.run';
export const IMPORT_SWEEP = 'knowledge-import.sweep';
