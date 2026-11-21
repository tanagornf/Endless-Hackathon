-- dependsOn: core
ALTER TABLE knowledge_items
  DROP CONSTRAINT knowledge_items_source_check,
  ADD CONSTRAINT knowledge_items_source_check CHECK (source IN ('manual','import','seed','fixture','web')),
  ADD COLUMN web_suggestion jsonb,
  ADD CONSTRAINT knowledge_items_web_suggestion_check CHECK ((source = 'web') = (web_suggestion IS NOT NULL));
