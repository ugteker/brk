# Compact Onboarding Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the new-account three-step guided wizard with one dialog that creates a source, a character-based agent, and their linked playbook.

**Architecture:** Keep the workflow in `AgentsPage.tsx`, using its existing `createSource`, `createAgent`, `createPlaybook`, source probing, and refresh helpers. Add a context trigger so AppShell's admin account menu can open the same dialog on demand.

**Tech Stack:** React, TypeScript, Ant Design, Tailwind CSS, react-i18next.

## Global Constraints

- New display text is localized in both English and German.
- Use Ant Design controls; do not add native controls.
- Do not run or address tests per the user's explicit instruction.
- The suggested source is `Lanz & Precht` (`https://www.youtube.com/playlist?list=PLdPrKDvwrog6nXguUXjQcTIw685Xa6Bg5`); custom URLs retain source probing.

---

### Task 1: Add an admin preview trigger

**Files:**
- Modify: `apps/web/src/context/AppDataContext.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`

**Interfaces:**
- Produces: `forceShowGuidedWizard: boolean` and `setForceShowGuidedWizard`.
- Consumes: the existing admin-only account-menu items and `/library` navigation.

- [ ] **Step 1: Add the context state**

Add `forceShowGuidedWizard` and its React state setter to `AppDataContextValue`, `AppDataProvider`, and the returned context value. Default to `false`.

- [ ] **Step 2: Add the admin menu item**

Add an admin-only account-menu item labeled with `onboarding.showWizardPreview`. Its click handler sets `forceShowGuidedWizard(true)` and navigates to `/library`.

### Task 2: Consolidate guided setup

**Files:**
- Modify: `apps/web/src/pages/AgentsPage.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/de.json`

**Interfaces:**
- Consumes: `probeSource`, `createSource`, `createAgent`, `createPlaybook`, `PROMPT_PERSONAS`, and `forceShowGuidedWizard`.
- Produces: one modal where users select Lanz & Precht or probe a custom source, choose a persona, then create the complete setup.

- [ ] **Step 1: Open the dialog for new accounts or admin preview**

Make the existing guided-wizard opening effect also react to `forceShowGuidedWizard`. Reset it after the modal is closed or setup completes.

- [ ] **Step 2: Replace steps with one source-and-persona form**

Remove `Steps` and `guidedWizardStep`. Render a selectable Lanz & Precht source tile and a custom-URL input/probe option above the existing persona cards. The primary button remains disabled until a suggested source is selected or the custom URL is successfully probed.

- [ ] **Step 3: Create the linked setup from the single submit action**

For the suggested tile, create a podcast source directly from:

```ts
{
  type: 'youtube_videos',
  value: 'https://www.youtube.com/playlist?list=PLdPrKDvwrog6nXguUXjQcTIw685Xa6Bg5',
  metadata: { title: 'Lanz & Precht', coverImageUrl: null, previewItems: [] }
}
```

For a custom choice, use the existing detected `guidedWizardSource`. Create one agent from `guidedWizardPersonaId`, create one daily 08:00 UTC playbook linking it to the new source, refresh app data, and close the modal. Do not run the agent automatically.

- [ ] **Step 4: Add translations**

Add localized labels for the combined setup title, suggested source, custom source, and admin wizard preview in both locale files.

### Task 3: Build and record completion

**Files:**
- Modify: `docs/superpowers/plans/2026-07-18-compact-onboarding-setup-plan.md`

- [ ] **Step 1: Build**

Run: `npm --prefix apps/web run build`

Expected: Vite completes without TypeScript or bundling errors.

- [ ] **Step 2: Mark plan steps complete**

Mark the preceding implementation and build steps complete.
