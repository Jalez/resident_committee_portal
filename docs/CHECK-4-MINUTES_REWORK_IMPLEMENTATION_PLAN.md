# Minutes Rework Implementation Plan (Check-4)

## Executive Summary

This document defines the concrete implementation plan for reworking minutes with:

1. **Internal visibility route** for all minutes (including not-yet-public drafts), controlled by RBAC.
2. **Secretary templates** for reusable minutes structures.
3. **Minutes checker workflow** (assign user, review, approve/reject).
4. **Official signature trail** for approved minutes (portal-native v1).
5. **Email + relationship picker integration** so linked, checked minutes feed autofill and are attached as PDF in reimbursement mail flow.

This plan is designed to fit existing architecture:
- `minute` is already a first-class entity in relationship picker and relation config.
- Mail draft edit already links `minute` + `receipt` + `reimbursement`.
- Smart autofill already reads linked minute/receipt/reimbursement context.

---

## 1. Scope and Non-Goals

## 1.1 In Scope

- New internal minutes browse route (all statuses).
- New minutes template CRUD for secretary role/permission.
- Checker assignment UI + status workflow.
- Official sign-off record and immutable hash metadata.
- Integration with existing relationship picker and smart autofill.
- Send-time guard for reimbursement emails requiring linked checked minute.

## 1.2 Not in Scope (Phase 1-2)

- Full third-party legal e-signature provider integration.
- Replacing Google Drive as source of truth for binary files.
- Multi-checker quorum workflow (v1 uses one assigned checker).

---

## 2. RBAC Design

## 2.1 Existing Permissions (reuse)

- `minutes:read`
- `minutes:write`
- `minutes:update`
- `minutes:delete`
- `minutes:export`
- `committee:email`

## 2.2 New Permissions (add)

Add these permission keys in `app/lib/permissions.ts`:

- `minutes:internal:read` — view all minutes, including draft/internal.
- `minutes:templates:read` — view minutes templates.
- `minutes:templates:write` — create/update/delete templates.
- `minutes:checker:assign` — assign checker user(s) to minute.
- `minutes:checker:review` — perform check (approve/reject).
- `minutes:signature:sign` — perform official sign-off action.
- `minutes:signature:read` — view signature audit trail.

## 2.3 Suggested Role Mapping

- **Secretary role**: `minutes:*`, `minutes:templates:*`, `minutes:checker:assign`, `minutes:signature:read`.
- **Minutes checker role**: `minutes:read`, `minutes:internal:read`, `minutes:checker:review`, `minutes:signature:sign`.
- **Committee editor role**: `minutes:update`, `minutes:internal:read`, optionally `minutes:checker:assign`.

---

## 3. Data Model Changes

## 3.1 Migration 1: Minutes Review + Signature Fields

Create migration: `drizzle/0034_add_minutes_review_signature_fields.sql`

Add columns to `minutes`:

- `visibility` text not null default `'internal'` (`internal | public | archived`)
- `checker_user_id` uuid null references users(id)
- `checker_status` text not null default `'pending'` (`pending | checked | rejected`)
- `checker_comment` text null
- `checked_at` timestamp null
- `checked_by` uuid null references users(id)
- `official_signature_status` text not null default `'unsigned'` (`unsigned | signed`)
- `official_signed_at` timestamp null
- `official_signed_by` uuid null references users(id)
- `signed_pdf_hash` text null

Indexes:

- `minutes_visibility_idx` on (`visibility`)
- `minutes_checker_user_id_idx` on (`checker_user_id`)
- `minutes_checker_status_idx` on (`checker_status`)

## 3.2 Migration 2: Minutes Templates Table

Create migration: `drizzle/0035_add_minutes_templates.sql`

Create table `minutes_templates`:

- `id` uuid pk
- `title` text not null
- `description` text null
- `template_body` text not null
- `default_language` text null
- `is_active` boolean not null default true
- `created_by` uuid null references users(id)
- `updated_by` uuid null references users(id)
- `created_at` timestamp not null default now()
- `updated_at` timestamp not null default now()

Indexes:

- `minutes_templates_active_idx` on (`is_active`)
- `minutes_templates_created_by_idx` on (`created_by`)

## 3.3 Optional Migration 3: Checker History (recommended)

Create migration: `drizzle/0036_add_minute_checker_history.sql`

Create table `minute_checker_history`:

- `id` uuid pk
- `minute_id` uuid not null references minutes(id) on delete cascade
- `action` text not null (`assigned | checked | rejected | unassigned | signed`)
- `actor_user_id` uuid null references users(id)
- `checker_user_id` uuid null references users(id)
- `comment` text null
- `metadata` text null (JSON)
- `created_at` timestamp not null default now()

---

## 4. Backend File-by-File Changes

## 4.1 Schema and Types

Update:

- `app/db/schema.ts`
  - extend `minutes` table columns
  - add `minutesTemplates` and optional `minuteCheckerHistory`
- `app/db/client.ts`
  - add types for new minute fields/status enums
  - add `MinutesTemplate` interfaces
- `app/db/adapters/types.ts`
  - add DB adapter contract methods

Add methods in adapters:

- `getMinutesForUser(filters, userPermissions)`
- `assignMinuteChecker(minuteId, checkerUserId, actorUserId)`
- `reviewMinute(minuteId, verdict, comment, actorUserId)`
- `signMinuteOfficial(minuteId, signedBy, hash)`
- `getMinutesTemplates()`
- `getMinutesTemplateById(id)`
- `createMinutesTemplate(data)`
- `updateMinutesTemplate(id, data)`
- `deleteMinutesTemplate(id)`

Implement in:

- `app/db/adapters/postgres.ts`
- `app/db/adapters/neon.ts`

## 4.2 Permissions and Entity Definitions

Update:

- `app/lib/permissions.ts`
  - register new permission keys (section 2.2)
- `app/lib/entity-definitions.ts`
  - extend `minute` field config with checker/signature fields as read-only/display fields
- `app/lib/relationships/permissions.server.ts`
  - ensure internal minute availability respects new read permission behavior for pickers

## 4.3 Minutes Routes

Update existing:

- `app/routes/minutes/_index.tsx`
  - keep current default listing behavior, but add explicit filtering semantics:
    - if user has `minutes:internal:read`, show all by default or via toggle
    - otherwise show only public/active view
- `app/routes/minutes/$minuteId/_index.tsx`
  - render checker + signature metadata section
- `app/routes/minutes/$minuteId/edit/_index.tsx`
  - add checker assignment input and template apply selector

Add new routes:

- `app/routes/minutes/internal/_index.tsx`
  - requires `minutes:internal:read`
  - always shows all minutes statuses + checker state
- `app/routes/minutes/templates/_index.tsx`
  - requires `minutes:templates:read`
- `app/routes/minutes/templates/new/_index.tsx`
  - requires `minutes:templates:write`
- `app/routes/minutes/templates/$templateId/edit/_index.tsx`
  - requires `minutes:templates:write`
- `app/routes/minutes/$minuteId/review/_index.tsx`
  - requires `minutes:checker:review`
  - approve/reject action
- `app/routes/api/minutes/$minuteId/assign-checker/_index.tsx`
  - requires `minutes:checker:assign`
- `app/routes/api/minutes/$minuteId/sign/_index.tsx`
  - requires `minutes:signature:sign`

Route registration update:

- `app/routes.ts`

## 4.4 Minutes API Consistency Fixes

Update:

- `app/routes/api/minutes/_index.tsx`
  - remove hardcoded draft exclusion
  - use permission-aware filtering:
    - with `minutes:internal:read`: include drafts/internal
    - without: return public-ready subset
- `app/routes/api/minutes/export/_index.tsx`
  - add optional `includeInternal=true` query requiring `minutes:internal:read`

## 4.5 Relationship Picker Integration

Update:

- `app/lib/relationships/load-relationships.server.ts`
  - for `minute` available entities, filter based on `userPermissions` and visibility/checker rules
- `app/routes/mail/drafts/$draftId/edit/_index.tsx`
  - minute section should expose checker badge/status in picker labels

No structural relation type changes needed (minute already exists in relation config and picker).

---

## 5. UI Reuse for Checker Assignment

Reuse existing person/email selection pattern:

- `app/components/committee-recipient-field.tsx`

Implementation note:

- Create `MinutesCheckerField` component based on the same `TagPicker` model.
- v1: enforce single selected app user (`checker_user_id`).
- Data source: existing users list endpoint/provider used by committee recipient flow.

---

## 6. Official Signature Model (v1)

## 6.1 Goal

Provide an **official portal sign-off** proving:
- who signed,
- when signed,
- what binary/document state was signed.

## 6.2 Mechanics

On sign action:

1. Validate checker state is `checked` (unless override permission exists).
2. Resolve minute PDF source URL (`fileUrl`).
3. Fetch binary and compute SHA-256 hash.
4. Persist:
   - `official_signature_status='signed'`
   - `official_signed_at`
   - `official_signed_by`
   - `signed_pdf_hash`
5. Write audit record to `minute_checker_history` (if table enabled).

This is not external legal PKI signing, but gives immutable internal evidence.

## 6.3 Future Extension (Phase 4+)

Optional provider-based legal signature integration:
- Visma Sign / DocuSign / Adobe Sign
- store envelope id + signed artifact URL in minute metadata

---

## 7. Mail + Autofill + Attachment Integration

## 7.1 Send-Time Guard

Update reimbursement email send logic in:

- `app/routes/mail/drafts/$draftId/edit/_index.tsx`

Current requirement is linked receipt + linked minute.
Add requirement:

- linked minute must have `checker_status='checked'`
- optionally `official_signature_status='signed'` (feature flag controlled)

If not valid, block send with clear error.

## 7.2 Autofill Enhancements

Update:

- `app/routes/api/entities/smart-autofill/_index.tsx`

Extend reimbursement mail body suggestions with:

- checker name/email
- checker verdict timestamp
- official signature timestamp/status
- minute title/id/hash summary

## 7.3 Attachment Behavior

Keep current attachment system for linked minute PDF.
No format change required; just enforce status guards before sending.

---

## 8. Secretary Templates Workflow

## 8.1 UX Flow

1. Secretary opens minutes template list.
2. Creates or updates template (`title`, `template_body`).
3. In minute edit/create, choose “Apply template”.
4. Template text pre-fills minute description/body fields.

## 8.2 Minimal Technical Path

- Route-based CRUD (no new complex editor needed in v1).
- Plain textarea template body.
- optional placeholders (later):
  - `{{meeting_date}}`
  - `{{meeting_title}}`
  - `{{checker_name}}`

---

## 9. Compatibility Notes

## 9.1 Relationship Picker

No new relation types are required.
Existing `minute` relationship type remains canonical.

## 9.2 Existing Reimbursement Edit Page

`app/routes/treasury/reimbursements/$reimbursementId/edit/_index.tsx` currently filters out draft minutes.

Change to permission-aware behavior:

- users with `minutes:internal:read` can select internal/draft minutes
- others continue seeing only public/active-ready items

## 9.3 Backward Compatibility

- Existing minutes without checker/signature data should default to:
  - `checker_status='pending'`
  - `official_signature_status='unsigned'`

---

## 10. Implementation Sequence

## Phase A (Safe foundation)

1. Add permissions + translations.
2. Add DB migrations 0034/0035 (and optional 0036).
3. Add adapter methods + schema/types.
4. Add permission-aware minute API behavior.

## Phase B (Workflow)

5. Add internal minutes route.
6. Add checker assignment/review/sign actions.
7. Add minute view/edit UI sections.

## Phase C (Templates + Mail integration)

8. Add template CRUD routes/pages.
9. Add apply-template action in minute edit.
10. Add send-time guard + autofill enhancement in mail draft flow.

## Phase D (hardening)

11. Add audit log view for checker/signature events.
12. Add tests and role-seed updates.

---

## 11. Testing Plan

## 11.1 Permission Tests

- user with only `minutes:read` cannot access `/minutes/internal`
- user with `minutes:internal:read` can
- only checker permissions can submit review verdict
- only signature permission can sign

## 11.2 Workflow Tests

- assign checker -> checker sees task -> approve -> signature enabled
- reject flow requires comment and keeps minute blocked for mail send
- reassignment resets checker state to pending

## 11.3 Integration Tests

- relationship picker links checked minute to mail draft
- smart autofill includes checker/signature metadata
- reimbursement email send fails when minute is unchecked
- reimbursement email send succeeds when minute checked (+ signed if required)

---

## 12. Acceptance Criteria

1. Internal route exists and correctly shows all minutes by RBAC.
2. Secretary can create/update/use templates in minute editing.
3. Checker can be assigned from existing users using familiar picker UX.
4. Checker verdict is stored with actor + timestamp.
5. Official sign-off stores actor + timestamp + PDF hash.
6. Relationship picker and mail draft flow work with checked minutes.
7. Smart autofill includes minute checker/signature context.
8. Reimbursement email send enforces checked minute requirement.

---

## 13. Rollout Notes

- Enable send-time strict guard behind feature flag first (`MINUTES_REQUIRE_CHECKED_FOR_REIMBURSEMENT_MAIL=true`).
- Backfill script optional: assign checker for open reimbursement-related minutes.
- Communicate role changes to admins (new permissions must be assigned in roles UI).

---

## 14. Quick File Change Checklist

Update:

- `app/lib/permissions.ts`
- `app/lib/entity-definitions.ts`
- `app/db/schema.ts`
- `app/db/client.ts`
- `app/db/adapters/types.ts`
- `app/db/adapters/postgres.ts`
- `app/db/adapters/neon.ts`
- `app/routes.ts`
- `app/routes/api/minutes/_index.tsx`
- `app/routes/api/minutes/export/_index.tsx`
- `app/routes/minutes/_index.tsx`
- `app/routes/minutes/$minuteId/_index.tsx`
- `app/routes/minutes/$minuteId/edit/_index.tsx`
- `app/lib/relationships/load-relationships.server.ts`
- `app/routes/treasury/reimbursements/$reimbursementId/edit/_index.tsx`
- `app/routes/mail/drafts/$draftId/edit/_index.tsx`
- `app/routes/api/entities/smart-autofill/_index.tsx`

Add:

- `drizzle/0034_add_minutes_review_signature_fields.sql`
- `drizzle/0035_add_minutes_templates.sql`
- `drizzle/0036_add_minute_checker_history.sql` (recommended)
- `app/routes/minutes/internal/_index.tsx`
- `app/routes/minutes/templates/_index.tsx`
- `app/routes/minutes/templates/new/_index.tsx`
- `app/routes/minutes/templates/$templateId/edit/_index.tsx`
- `app/routes/minutes/$minuteId/review/_index.tsx`
- `app/routes/api/minutes/$minuteId/assign-checker/_index.tsx`
- `app/routes/api/minutes/$minuteId/sign/_index.tsx`
- `app/components/minutes/minutes-checker-field.tsx`

