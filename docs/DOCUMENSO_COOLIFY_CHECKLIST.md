# Documenso on Coolify: Production Checklist

This checklist is tailored for the Hippos Portal minutes-signing flow described in Check-4.

## 1) Create a dedicated Coolify stack

- Create a new **Docker Compose** application in Coolify.
- Use [docs/documenso.coolify.compose.yml](docs/documenso.coolify.compose.yml).
- Keep Documenso in a separate stack from the portal app for safer upgrades.

## 2) Configure persistent storage

- `documenso_postgres_data` for Documenso DB.
- `documenso_certs` if using file-based signing certificate path.
- Ensure your server backup policy includes both volumes.

## 3) Configure required environment variables

Set these first:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `NEXTAUTH_SECRET`
- `NEXT_PRIVATE_ENCRYPTION_KEY`
- `NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY`
- `NEXT_PUBLIC_WEBAPP_URL` (e.g. `https://sign.yourdomain.fi`)
- `NEXT_PRIVATE_SMTP_HOST`
- `NEXT_PRIVATE_SMTP_FROM_NAME`
- `NEXT_PRIVATE_SMTP_FROM_ADDRESS`
- `NEXT_PRIVATE_SIGNING_PASSPHRASE`

Recommended:

- `NEXT_PUBLIC_DISABLE_SIGNUP=true`
- `DOCUMENSO_DISABLE_TELEMETRY=true`

Certificate options:

- **Option A (simplest in Coolify)**: set `NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS` as base64 of `.p12`.
- **Option B**: mount certificate at `/opt/documenso/certs/cert.p12` and set `NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH`.

## 4) Domain and HTTPS

- Assign a domain in Coolify to `documenso` service.
- Example: `https://sign.yourdomain.fi`
- Use Coolify-managed TLS (Let’s Encrypt).
- Confirm `NEXT_PUBLIC_WEBAPP_URL` exactly matches public domain.

## 5) Health checks and deployment validation

- Compose uses Documenso `/api/health` and Postgres `pg_isready` checks.
- After deploy, verify:
  - Documenso UI loads
  - User login/admin works
  - Invite email can be sent
  - Signature flow works for a test document

## 6) Portal integration (Hippos)

Current portal recipient source:

- Foundation address comes from `SETTINGS_KEYS.REIMBURSEMENT_RECIPIENT_EMAIL` with env fallback `RECIPIENT_EMAIL`.

Planned Check-4 integration settings (add to portal when implementing):

- `DOCUMENSO_BASE_URL` (e.g. `https://sign.yourdomain.fi`)
- `DOCUMENSO_API_KEY`
- `DOCUMENSO_WEBHOOK_SECRET`
- `DOCUMENSO_ENABLED=true`

Planned portal routes (from the implementation plan):

- Create signature request from linked unsigned minute.
- Receive provider webhooks and update minute signer state.
- On signed state, autofill foundation recipient for next linked thread.

## 7) Webhook setup

In Documenso:

- Create webhook targeting portal endpoint (planned):
  - `POST https://<portal-domain>/api/signatures/webhook`
- Subscribe to signature/request completion and signer status events.
- Configure shared secret and validate HMAC/signature in portal.

## 8) SMTP and deliverability

- Documenso uses SMTP for signer invite notifications.
- Use a sender domain with SPF/DKIM configured.
- Validate deliverability to checker emails before production rollout.

## 9) Backup and recovery

- Back up `documenso_postgres_data` daily.
- Back up cert material (`documenso_certs` or secret source).
- Test restore into a staging stack at least once.

## 10) Security hardening

- Restrict admin signup (`NEXT_PUBLIC_DISABLE_SIGNUP=true`).
- Rotate API keys and webhook secrets periodically.
- Keep Documenso image updated (`documenso/documenso:latest` or pin to tested tag).
- Store secrets in Coolify env UI, not in git-tracked files.

## 11) Go-live smoke tests

- Secretary links unsigned minute and autofill includes signer recipients.
- Sending invite thread creates signature request in Documenso.
- Signers receive invite email and can sign.
- Webhook updates minute status to signed when all required signatures complete.
- Secretary links signed minute in new thread and autofill targets foundation recipient.
