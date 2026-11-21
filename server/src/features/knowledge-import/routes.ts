import { AppError, defineFeatureRoutes } from '../../core';
import { IMPORT_JOB, IMPORT_SWEEP, MAX_BYTES } from './config';
import { runImport, sweepImports } from './handler';
import { ImportId, ListQuery, MappingBody, RowsQuery, UploadBody } from './schemas';
import { cancelImport, createFileImport, getImport, listImports, listRows, submitMapping } from './service';

const base = '/businesses/:businessId/imports';
const read = { auth: 'business', permission: 'product.read' } as const;
const write = { auth: 'business', permission: 'product.write' } as const;

export default defineFeatureRoutes({
  featureId: 'F06',
  slug: 'knowledge-import',
  jobs: { [IMPORT_JOB]: runImport },
  schedules: [{ name: IMPORT_SWEEP, everySeconds: 600, handler: sweepImports }],
  register(api) {
    api.get(base, { ...read, query: ListQuery, summary: 'List imports' },
      async ctx => listImports(ctx.business!.id, ctx.query));
    api.get(base + '/:importId', { ...read, summary: 'Get import progress' },
      async ctx => getImport(ctx.business!.id, ImportId.parse(ctx.params.importId)));
    api.get(base + '/:importId/rows', { ...read, query: RowsQuery, summary: 'Read import preview rows' },
      async ctx => listRows(ctx.business!.id, ImportId.parse(ctx.params.importId), ctx.query));
    api.post(base + '/file', { ...write, body: UploadBody, upload: { field: 'file', maxFiles: 1, maxMb: MAX_BYTES / 1024 / 1024 }, summary: 'Upload a CSV or TSV for review' },
      async ctx => {
        const file = ctx.files[0];
        if (!file) throw new AppError('VALIDATION_ERROR', 'Select a CSV or TSV file', { details: { reason: 'empty_file' } });
        return { kind: 'json', status: 202, data: await createFileImport(ctx.business!.id, ctx.user!.id, file, ctx.body.options) } as const;
      });
    api.post(base + '/:importId/mapping', { ...write, body: MappingBody, summary: 'Validate the selected column mapping' }, async ctx => ({
      kind: 'json', status: 202, data: await submitMapping(ctx.business!.id, ImportId.parse(ctx.params.importId), ctx.user!.id, ctx.body),
    } as const));
    api.post(base + '/:importId/cancel', { ...write, summary: 'Cancel a pending import' },
      async ctx => cancelImport(ctx.business!.id, ImportId.parse(ctx.params.importId), ctx.user!.id));
  },
});
