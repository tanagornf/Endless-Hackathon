import { defineFeatureRoutes } from '../../core';
import { indexJobHandler } from './index-job';
import { INDEX_JOB } from './indexing';

export default defineFeatureRoutes({
  featureId: 'F07',
  slug: 'knowledge-search',
  register() {},
  jobs: { [INDEX_JOB]: indexJobHandler },
});
