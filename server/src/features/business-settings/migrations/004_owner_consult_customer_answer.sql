-- dependsOn: core
ALTER TABLE owner_consult_steps ADD COLUMN answer_prompts jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(answer_prompts)='array');
ALTER TABLE owner_consult_steps ADD COLUMN private_rationale text
  CHECK (char_length(private_rationale)<=2000);
ALTER TABLE owner_consult_steps ADD COLUMN customer_ready_at timestamptz;
