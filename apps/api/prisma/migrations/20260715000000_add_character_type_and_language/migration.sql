-- Add characterType and promptConfigJson to Agent
ALTER TABLE "Agent" ADD COLUMN "characterType" TEXT NOT NULL DEFAULT 'summarizer';
ALTER TABLE "Agent" ADD COLUMN "promptConfigJson" TEXT NOT NULL DEFAULT '{}';

-- Add language to Playbook
ALTER TABLE "Playbook" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
