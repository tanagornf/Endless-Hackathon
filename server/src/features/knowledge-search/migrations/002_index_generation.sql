-- dependsOn: core, knowledge
ALTER TABLE knowledge_index_states ADD COLUMN generation int NOT NULL DEFAULT 0 CHECK (generation >= 0);
