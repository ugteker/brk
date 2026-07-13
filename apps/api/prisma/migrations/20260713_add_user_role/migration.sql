-- AlterTable: add persisted role to User (defaults to 'user'; bootstrap script
-- sets ADMIN_EMAIL account to 'admin' on first run and on every subsequent boot).
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';
