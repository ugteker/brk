-- AlterTable: add optional playbookId FK to AgentRun so scheduled runs are traceable
-- to the Playbook that triggered them, and the scheduler can pass recipients/language.
ALTER TABLE "AgentRun" ADD COLUMN "playbookId" TEXT REFERENCES "Playbook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
