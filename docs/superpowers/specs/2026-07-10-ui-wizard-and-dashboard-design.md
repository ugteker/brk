# Brokerino UI Redesign Spec: Bot Dashboard + Full Configuration Wizard

## Scope
Upgrade the frontend from a minimal form to a full-featured, modern shadcn-based experience for bot configuration.

Application name: **Brokerino**

In scope:
- Default start view: **Bot Dashboard**
- 7-step wizard for full bot configuration
- Rich source management and advanced strategy/risk/notification options
- Review/test/save flow

Out of scope:
- New backend domains beyond existing bot config contract
- Buy/sell engine internals

## Confirmed UX Decisions
- Layout pattern: **Wizard stepper**
- Guidance level: **Balanced** (short helper text + inline validation)
- Mandatory steps:
  1. Basic identity
  2. Sources
  3. Schedule
  4. Asset universe + strategy
  5. Risk settings
  6. Notifications
  7. Review & test
- Default start view: **Bot Dashboard overview**

## Information Architecture
1. **Bot Dashboard (default)**
   - Bot cards/list
   - Last run status and next run snapshot
   - Primary CTA: Create Bot
2. **Bot Wizard**
   - Top (mobile) / left (desktop) stepper
   - Main form pane
   - Sticky summary panel (desktop) / summary drawer (mobile)

## Wizard Step Design
1. **Basic identity**
   - Name, description, active toggle
2. **Sources**
   - Add/remove/reorder source rows
   - Type (web URL / podcast feed), URL/feed input
   - Per-source frequency, enabled toggle
3. **Schedule**
   - Interval OR daily-time + timezone
4. **Asset universe + strategy**
   - Symbols/sectors
   - Strategy style, horizon, conviction rule
5. **Risk settings**
   - Risk level, max exposure, stop loss, take profit
6. **Notifications**
   - Recipients, cadence, report detail level
7. **Review & test**
   - Read-only summary
   - Validation checklist
   - Send test report and Save actions

## Interaction Rules
- Next validates current step only.
- Back is always available.
- Forward jump allowed only to previously valid steps.
- Save is only available in Review & test.
- On successful save: return to dashboard with refreshed bot card/status.

## Component System Policy
All newly added UI must use shadcn/ui components and patterns.

Primary component set:
- Layout/surfaces: Card, Separator, Badge
- Inputs: Input, Textarea, Select, Switch, Checkbox
- Actions: Button variants
- Feedback: inline errors + status banners/toasts

No raw ad-hoc controls for new wizard fields.

## Error Handling
- Field-level inline validation.
- Step-level summary of blocking issues.
- Explicit loading and success/error states for:
  - Send test report
  - Save configuration

## Testing
- Unit tests:
  - wizard state transitions
  - per-step validation logic
- Component tests:
  - source row add/remove/reorder logic
  - summary panel updates
- E2E:
  - dashboard default view
  - create bot entry
  - complete wizard
  - save and return to dashboard

## Acceptance Criteria
- App opens on Bot Dashboard by default.
- User can complete all 7 mandatory wizard steps.
- All mandatory configuration groups are represented in the UI.
- Save flow works from review step and returns to dashboard.
- New UI is consistently shadcn-based and visually modern.
