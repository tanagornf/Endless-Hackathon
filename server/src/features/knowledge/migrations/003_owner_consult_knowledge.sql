-- dependsOn: core
ALTER TABLE knowledge_items
  DROP CONSTRAINT knowledge_items_source_check,
  ADD CONSTRAINT knowledge_items_source_check CHECK (source IN ('manual','import','seed','fixture','web','owner-consult')),
  ADD CONSTRAINT knowledge_items_owner_consult_source_check CHECK (
    source <> 'owner-consult' OR (source_ref IS NOT NULL AND client_request_id IS NOT NULL)
  );
