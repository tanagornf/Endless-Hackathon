-- dependsOn: core
CREATE TABLE shop_instruction_candidates (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  answer_receipt_id uuid NOT NULL,
  case_id uuid NOT NULL,
  action_step_id text NOT NULL,
  analysis_usage_id uuid NOT NULL UNIQUE,
  base_version_id uuid,
  instruction text NOT NULL CHECK (char_length(instruction) BETWEEN 1 AND 4002),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id,id),
  UNIQUE (business_id,answer_receipt_id)
);

CREATE TABLE shop_instruction_versions (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  revision integer NOT NULL CHECK (revision >= 1),
  parent_version_id uuid,
  candidate_id uuid,
  restored_from_version_id uuid,
  instruction text CHECK (char_length(instruction) BETWEEN 1 AND 4002),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id,id),
  UNIQUE (business_id,revision),
  UNIQUE (business_id,candidate_id),
  FOREIGN KEY (business_id,parent_version_id) REFERENCES shop_instruction_versions (business_id,id),
  FOREIGN KEY (business_id,restored_from_version_id) REFERENCES shop_instruction_versions (business_id,id),
  FOREIGN KEY (business_id,candidate_id) REFERENCES shop_instruction_candidates (business_id,id),
  CHECK ((revision=1) = (parent_version_id IS NULL)),
  CHECK (candidate_id IS NULL OR (restored_from_version_id IS NULL AND instruction IS NOT NULL)),
  CHECK (candidate_id IS NOT NULL OR restored_from_version_id IS NOT NULL OR instruction IS NULL)
);

ALTER TABLE shop_instruction_candidates ADD FOREIGN KEY (business_id,base_version_id)
  REFERENCES shop_instruction_versions (business_id,id);
