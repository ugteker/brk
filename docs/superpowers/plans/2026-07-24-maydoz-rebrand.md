# Maydoz Website Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the website as Maydoz with a transparent logo and podcast-, video-, and web-focused login marketing.

**Architecture:** Produce one optimized transparent PNG in Vite's public asset directory, expose it through a reusable `BrandLockup` component, and use that component in both authenticated and login layouts. Keep all marketing copy in the existing i18n dictionaries and validate the brand contract with the current Playwright smoke suite.

**Tech Stack:** React 18, TypeScript, Vite, Ant Design, Tailwind CSS, i18next, Playwright, Pillow 12

## Global Constraints

- The product name is `Maydoz`.
- The hero is `Listen less. Know more.`
- The English subtitle is `Maydoz agents turn podcasts, videos, and the web into insights made for you.`
- New marketing copy must not mention trading or vendor names.
- Preserve authentication behavior, navigation behavior, responsive breakpoints, and keyboard accessibility.
- Do not change backend email branding, deployment paths, internal package names, or historical documents.
- Do not commit changes unless the user explicitly requests a commit.

---

### Task 1: Transparent Brand Asset and Lockup

**Files:**
- Create: `apps/web/public/maydoz-logo.png`
- Create: `apps/web/src/components/BrandLockup.tsx`
- Modify: `apps/web/e2e/agent-setup.spec.ts`

**Interfaces:**
- Consumes: `/maydoz-logo.png` served by Vite.
- Produces: `BrandLockup({ size?: number, textColor?: string, className?: string }): JSX.Element`.

- [ ] **Step 1: Add brand asset smoke coverage**

Add a smoke test that reads `public/maydoz-logo.png` and `src/components/BrandLockup.tsx`, verifies the PNG signature, and asserts that the component references `/maydoz-logo.png`, `alt="Maydoz"`, and the `Maydoz` wordmark.

- [ ] **Step 2: Generate the transparent PNG**

Use Pillow to load `apps/web/logo/maydoz-logo.jpg`, classify low-saturation light checkerboard pixels as background, derive a soft alpha mask from saturation and green-channel contrast, crop to the nontransparent logo bounds with padding, and save RGBA output to `apps/web/public/maydoz-logo.png`.

The generated file must have PNG format, RGBA mode, a transparent corner pixel, and nontransparent green logo pixels.

- [ ] **Step 3: Implement the shared lockup**

Create `BrandLockup.tsx` with this public shape:

```tsx
interface BrandLockupProps {
  size?: number;
  textColor?: string;
  className?: string;
}

export function BrandLockup({
  size = 40,
  textColor = 'currentColor',
  className
}: BrandLockupProps) {
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <img src="/maydoz-logo.png" alt="Maydoz" width={size} height={size} style={{ objectFit: 'contain' }} />
      <span style={{ color: textColor, fontWeight: 700, letterSpacing: '-0.02em' }}>Maydoz</span>
    </span>
  );
}
```

- [ ] **Step 4: Verify the asset and focused test**

Run:

```powershell
python -c "from PIL import Image; im=Image.open(r'apps\web\public\maydoz-logo.png'); assert im.mode == 'RGBA'; assert im.getpixel((0,0))[3] == 0; assert im.getbbox(); print(im.size)"
npm --prefix apps/web run test:smoke -- --grep "brand asset"
```

Expected: Pillow assertions pass and Playwright reports the test passing.

### Task 2: Website Branding and Login Marketing

**Files:**
- Modify: `apps/web/index.html:6`
- Modify: `apps/web/src/components/AppShell.tsx:251-285`
- Modify: `apps/web/src/pages/AuthPage.tsx:22-176`
- Modify: `apps/web/src/i18n/locales/en.json:55-60,448-480`
- Modify: `apps/web/src/i18n/locales/de.json:54-59,447-479`
- Modify: `apps/web/e2e/agent-setup.spec.ts`

**Interfaces:**
- Consumes: `BrandLockup` from Task 1 and existing `useTranslation()`.
- Produces: localized keys `auth.heroTitle`, `auth.heroSubtitle`, `auth.featureSources`, `auth.featureAgents`, and `auth.featureInsights`.

- [ ] **Step 1: Add website brand smoke coverage**

Add a smoke test that reads the page title, login page, app shell, and both locale files. Assert:

```ts
expect(indexHtml).toContain('<title>Maydoz</title>');
expect(authPage).toContain("t('auth.heroTitle')");
expect(authPage).toContain("t('auth.heroSubtitle')");
expect(appShell).toContain('<BrandLockup');
expect(english.auth.heroTitle).toBe('Listen less. Know more.');
expect(english.auth.heroSubtitle).toBe('Maydoz agents turn podcasts, videos, and the web into insights made for you.');
expect([indexHtml, authPage, appShell, englishText, germanText].join('\n')).not.toContain('ChatTrader');
```

- [ ] **Step 2: Replace the browser and app-shell branding**

Set `apps/web/index.html` to `<title>Maydoz</title>`. In `AppShell.tsx`, import `BrandLockup`, preserve the existing click and Enter/Space navigation behavior, and replace the text-only `Title` with a semantic button containing `<BrandLockup size={36} />`.

- [ ] **Step 3: Rebuild the login brand panel**

In `AuthPage.tsx`, replace `BRAND_FEATURES` with translation keys:

```ts
const BRAND_FEATURE_KEYS = [
  'auth.featureSources',
  'auth.featureAgents',
  'auth.featureInsights'
] as const;
```

Use `<BrandLockup size={52} textColor="#fff" />` on desktop and `<BrandLockup size={40} />` on mobile. Render `t('auth.heroTitle')` as the hero, `t('auth.heroSubtitle')` as its subtitle, translate each feature key, and update the copyright to `© 2026 Maydoz`.

- [ ] **Step 4: Add English and German marketing copy**

Use these exact English values:

```json
"title": "Maydoz",
"subtitle": "Turn the content you follow into insights made for you.",
"heroTitle": "Listen less. Know more.",
"heroSubtitle": "Maydoz agents turn podcasts, videos, and the web into insights made for you.",
"featureSources": "Podcasts, videos, and websites in one place",
"featureAgents": "AI agents that find what matters",
"featureInsights": "Personalized insights without the endless scroll"
```

Use these exact German values:

```json
"title": "Maydoz",
"subtitle": "Verwandle die Inhalte, denen du folgst, in Erkenntnisse für dich.",
"heroTitle": "Weniger hören. Mehr wissen.",
"heroSubtitle": "Maydoz-Agenten machen aus Podcasts, Videos und dem Web Erkenntnisse, die zu dir passen.",
"featureSources": "Podcasts, Videos und Websites an einem Ort",
"featureAgents": "KI-Agenten, die das Wesentliche finden",
"featureInsights": "Persönliche Erkenntnisse statt endlosem Scrollen"
```

Change the existing library empty-state descriptions in both locales from ChatTrader to Maydoz.

- [ ] **Step 5: Update the existing mobile smoke fixture**

Change the fixture heading in `agent-setup.spec.ts` from `ChatTrader` to `Maydoz` so the test data matches the current product.

- [ ] **Step 6: Run focused checks**

Run:

```powershell
npm --prefix apps/web run test:smoke -- --grep "brand asset|Maydoz website branding|app load"
rg -n "ChatTrader|trading|YouTube" apps/web/src/pages/AuthPage.tsx apps/web/src/components/AppShell.tsx apps/web/src/i18n/locales/en.json apps/web/src/i18n/locales/de.json apps/web/index.html
```

Expected: focused tests pass. The search may find legacy vendor names elsewhere in locale files, but no matches may occur in the new auth marketing keys or active brand components.

### Task 3: Web Validation

**Files:**
- Verify all files changed by Tasks 1 and 2.

**Interfaces:**
- Consumes: the complete Maydoz website rebrand.
- Produces: buildable and smoke-tested web application.

- [ ] **Step 1: Run the complete web smoke suite**

Run: `npm --prefix apps/web run test:smoke`

Expected: all smoke tests pass.

- [ ] **Step 2: Build the production web bundle**

Run: `npm --prefix apps/web run build`

Expected: Vite completes without TypeScript or bundling errors.

- [ ] **Step 3: Inspect the final diff**

Run: `git --no-pager diff -- apps/web docs/superpowers/specs/2026-07-24-maydoz-rebrand-design.md docs/superpowers/plans/2026-07-24-maydoz-rebrand.md`

Expected: only the approved brand asset, reusable lockup, website copy/layout, tests, and design documents are changed.
