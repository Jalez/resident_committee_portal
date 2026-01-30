-- Add local Ollama AI settings to users

ALTER TABLE "users" ADD COLUMN "local_ollama_enabled" boolean;
ALTER TABLE "users" ADD COLUMN "local_ollama_url" text;

UPDATE "users"
SET local_ollama_enabled = false,
	local_ollama_url = 'http://localhost:11434';

ALTER TABLE "users"
	ALTER COLUMN "local_ollama_enabled" SET DEFAULT false,
	ALTER COLUMN "local_ollama_url" SET DEFAULT 'http://localhost:11434',
	ALTER COLUMN "local_ollama_enabled" SET NOT NULL,
	ALTER COLUMN "local_ollama_url" SET NOT NULL;
