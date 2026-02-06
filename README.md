# Resident Committee Portal

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FJalez%2Fresident_committee_portal)

A modern, production-ready portal designed for resident committees and tenant associations. This platform streamlines communication between residents and their representatives, providing tools for involvement, transparency, and administrative management.

The objective of this project is to provide a generic, easily deployable template that any resident committee can use to manage their community engagement.

---

## Key Features

- **Resident Involvement**: Integrated forms for committee applications, event suggestions, and purchase requests.
- **Event Management**: Up-to-date view of upcoming community events (integrated with Google Calendar).
- **Transparency**: Easy access to meeting minutes, treasury records, and public documents.
- **Social Integration**: Dynamic social media links managed via the Admin Dashboard.
- **Info Reel Mode**: Automated "kiosk" mode that cycles through all pages—perfect for public displays.
- **Admin Dashboard**: A dedicated management interface for committee members to track and process submissions.

## Tech Stack

- **Framework**: [React Router 7](https://reactrouter.com/) (Vite)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Components**: [shadcn/ui](https://ui.shadcn.com/) based components
- **Database**: [Drizzle ORM](https://orm.drizzle.team/) with [Neon](https://neon.tech/) PostgreSQL
- **Integrations**: Google Cloud API (Drive, Calendar)
- **Runtime**: [Bun](https://bun.sh/) (Required)

## Getting Started

### Prerequisites

Ensure you have [Bun](https://bun.sh/) installed:

```bash
curl -fsSL https://bun.sh/install | bash
```

### Installation

1.  **Install dependencies**:
    ```bash
    bun install
    ```

2.  **Environment Setup**:
    Copy the template and fill in your keys (see [Google Services Integration](#google-services-integration)):
    ```bash
    cp .env.template .env
    ```

### Database Setup

The easiest way to start fresh (migrates schema + seeds roles):

```bash
# WARNING: This wipes the database!
bun run db:reset
```

Or manually:
```bash
bun run db:push                # Apply schema
bun run scripts/seed-rbac.ts   # Create access roles
```

### Development

Start the development server:

```bash
bun dev
```

The application will be available at `http://localhost:5173`.

### Local email testing (Mailpit)

The portal can send email (e.g. committee mail to role members). For local development you can use [Mailpit](https://github.com/axllent/mailpit) to capture outgoing mail instead of sending it for real. Mailpit runs a local SMTP server and a web UI where you can view all captured messages.

1. **Install** (macOS with Homebrew):
   ```bash
   brew install mailpit
   ```

2. **Run** Mailpit (SMTP on port 1025, web UI on 8025):
   ```bash
   mailpit
   ```
   Open the UI at [http://localhost:8025](http://localhost:8025) to view captured emails.

3. **Configure** your `.env` for committee mail:
   ```bash
   SMTP_HOST=localhost
   SMTP_PORT=1025
   SMTP_SECURE=false
   COMMITTEE_FROM_EMAIL=committee@test.local
   # COMMITTEE_FROM_NAME=Test Committee   # optional
   ```
   Leave `SMTP_USER` and `SMTP_PASS` unset when using Mailpit (no auth).

For more options and details, see [Mailpit’s documentation](https://github.com/axllent/mailpit).

## Deployment

### Vercel (Recommended)

1.  Push your code to a Git repository.
2.  Click the **Deploy with Vercel** button above.
3.  Configure your environment variables in Vercel.
4.  Connect a Neon PostgreSQL database via Vercel Integrations.

### Docker (Self-Hosted)

Build and run the container using [Bun](https://bun.sh/):

```bash
# Build the image
docker build -t hippos-portal .

# Run the container (expose on port 3000)
docker run -p 3000:3000 --env-file .env hippos-portal
```

## Database Management

The portal uses PostgreSQL. Two adapters are included:
- **postgres**: Standard PostgreSQL (default for local development)
- **neon**: [Neon](https://neon.tech/) serverless PostgreSQL (default for production)

Common commands:
```bash
bun run db:push      # Push schema changes
bun run db:studio    # Open Drizzle Admin GUI
bun run db:reset     # WIPE database and reset to fresh state
```

## Receipt Storage Configuration

The portal supports multiple storage backends for receipt files. Configure the storage provider using the `RECEIPT_STORAGE_PROVIDER` environment variable in your `.env` file.

### Available Storage Providers

1. **Vercel Blob** (default, recommended for Vercel deployments)
   - Set `RECEIPT_STORAGE_PROVIDER=vercel-blob`
   - Requires `BLOB_READ_WRITE_TOKEN` from your Vercel project settings
   - No additional packages needed

2. **Filesystem** (recommended for self-hosted deployments)
   - Set `RECEIPT_STORAGE_PROVIDER=filesystem`
   - Files are stored in `public/receipts/` by default (configurable via `RECEIPT_STORAGE_DIR`)
   - No additional packages needed

3. **S3-Compatible Storage** (AWS S3, MinIO, DigitalOcean Spaces, etc.)
   - Set `RECEIPT_STORAGE_PROVIDER=s3`
   - **Requires installing AWS SDK packages**:
     ```bash
     bun add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
     ```
   - Required environment variables:
     - `S3_BUCKET` - Your S3 bucket name
     - `S3_ACCESS_KEY_ID` - Your access key ID
     - `S3_SECRET_ACCESS_KEY` - Your secret access key
     - `S3_REGION` - AWS region (default: `us-east-1`)
     - `S3_ENDPOINT` - Optional, for S3-compatible services (e.g., MinIO: `http://localhost:9000`)
     - `S3_PUBLIC_URL` - Optional, public CDN URL for accessing files
     - `S3_FORCE_PATH_STYLE` - Set to `true` for MinIO and similar services

   > **Note**: AWS SDK packages are not included by default to keep bundle size small. They are only loaded dynamically when S3 storage is used, so they won't affect bundle size for users who don't need S3.

## Google Services Integration

This project integrates with Google Calendar, Drive, and Sheets. To enable these features, you need to set up Google Cloud credentials.

### Setup Instructions

1.  **Duplicate the template**:
    ```bash
    cp .env.template .env
    ```

2.  **Get a Google API Key**:
    - Go to the [Google Cloud Console](https://console.cloud.google.com/).
    - Create a new project or select an existing one.
    - Enable the following APIs:
        - **Google Calendar API**
        - **Google Drive API**
    - Create credentials -> API Key.
    - Paste this key into `GOOGLE_API_KEY` in your `.env` file.

3.  **Get IDs**:
    - **Calendar ID**: Open Google Calendar settings -> Integrate calendar -> Calendar ID.
    
    - **Public Root Folder ID** (`GOOGLE_DRIVE_PUBLIC_ROOT_ID`): 
        - Create a root folder (e.g., "Committee Public Folder") in Google Drive.
        - Inside it, create folders for each year (e.g., "2026").
        - Inside a year folder (e.g. "2026"), create a folder named `minutes`.
        - **Share this folder with "Anyone with the link" (Viewer)**.
        - Get the ID from the URL and paste into `GOOGLE_DRIVE_PUBLIC_ROOT_ID`.

4.  **Create a Service Account** (for uploading receipts and minutes):
    - In Google Cloud Console -> IAM & Admin -> Service Accounts
    - Click "Create Service Account"
    - Give it a name (e.g., "Committee Portal")
    - Click "Create and Continue" (skip optional steps)
    - Click on the service account "..." -> Manage Keys -> Add Key -> Create New Key -> JSON
    - Download the JSON file
    - From the JSON, copy:
        - `client_email` -> `GOOGLE_SERVICE_ACCOUNT_EMAIL`
        - `private_key` -> `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (replace newlines with `\n`)



5.  **Share Google Calendar with Service Account** (for creating/editing events):
    - Open [Google Calendar](https://calendar.google.com)
    - In the left sidebar under "My calendars", **hover over** your calendar name
    - Click the three vertical dots (⋮) that appear on hover
    - Select "Settings and sharing"
    - Scroll down to "Share with specific people or groups"
    - Click "+ Add people and groups"
    - Paste your service account email (the `client_email` from the JSON key file, e.g., `something@project-id.iam.gserviceaccount.com`)
    - Set permission to **"Make changes to events"**
    - Click "Send"
    
    > ⚠️ **Important**: Without this step, users with `events:write` permission in the app will get a 403 "requiredAccessLevel" error when trying to create events.

6.  **Permissions Summary**:
    | Resource | Share With | Permission Level |
    |----------|------------|------------------|
    | Calendar | Public | View (for event display) |
    | Calendar | Service Account | Make changes to events |
    | Public folder | Anyone with link | Viewer |
 
---

## Email Configuration

The portal uses two separate email systems for different purposes. You can configure one or both depending on your needs.

### 1. System Emails (Resend)
Used for automated transactional emails, such as **reimbursement request notifications**.

- **Required for**: Reimbursement workflow.
- **Provider**: [Resend](https://resend.com/)
- **Configuration**:
  Add these to your `.env` file:
  ```env
  RESEND_API_KEY=re_123456789
  SENDER_EMAIL=notifications@yourdomain.com
  RECIPIENT_EMAIL=treasurer@yourdomain.com
  ```

#### Inbound Replies (Optional)
Allows the system to process replies to reimbursement emails (e.g., to automatically update status).
```env
RESEND_INBOUND_EMAIL=start@your-resend-domain.com
RESEND_WEBHOOK_SECRET=whsec_...
```

### 2. Committee Mail (SMTP / IMAP)
Used for the **Mail** tab in the portal, allowing committee members to send and view emails directly from the dashboard.

- **Required for**: "Mail" route functionality.
- **Provider**: Any SMTP provider (Gmail, Outlook, custom SMTP).
- **Configuration**:
  Add these to your `.env` file:
  ```env
  SMTP_HOST=smtp.example.com
  SMTP_PORT=587
  SMTP_SECURE=false
  SMTP_USER=committee@example.com
  SMTP_PASS=secure-password
  COMMITTEE_FROM_EMAIL=committee@example.com
  # Optional:
  COMMITTEE_FROM_NAME=Committee Name
  
  # Optional: For viewing inbox
  IMAP_HOST=imap.example.com
  IMAP_PORT=993
  IMAP_SECURE=true
  IMAP_USER=committee@example.com
  IMAP_PASS=secure-password
  ```

#### Example: Gmail
If you want to use a Gmail account to send emails:
1. Enable **2-Step Verification** in your Google Account.
2. Go to [App Passwords](https://myaccount.google.com/apppasswords) and create a new app password.
3. Add these to your `.env` file:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-16-char-app-password
   ```

---

## Internationalization (i18n)

The portal supports multiple languages. Languages are automatically discovered from the filesystem.

### Adding a New Language

1. Create a new folder in `public/locales/` with the language code (e.g., `fr` for French):
   ```
   public/locales/fr/
   ```

2. Copy an existing translation file as a starting point:
   ```bash
   cp public/locales/en/common.json public/locales/fr/common.json
   ```

3. Edit `public/locales/fr/common.json` and translate all values. Make sure to set the language's display name:
   ```json
   {
     "lang": {
       "name": "Français",
       "label": "Langue"
     },
     ...
   }
   ```

4. Restart the dev server – the new language will appear in the language switcher automatically.

### Current Languages

- 🇬🇧 English (`en`)
- 🇫🇮 Suomi (`fi`)
- 🇸🇪 Svenska (`sv`)
- 🇩🇪 Deutsch (`de`)
 
---
 
## Performance & Caching
 
To minimize network overhead and ensure a smooth experience (especially in Info Reel mode), the portal implements two layers of caching:
 
### 1. Server-Side Caching
The backend caches data from Google APIs to avoid hitting rate limits and to speed up page loads.
- **Location**: `app/lib/cache.server.ts`
- **Duration**: Default is **3 hours**.
 
### 2. Client-Side Caching (TanStack Query)
The frontend uses [TanStack Query](https://tanstack.com/query/latest) to store fetched data in memory. This prevents redundant network requests during route transitions.
- **Location**: `app/lib/query-config.ts`
- **Default Stale Time**: **10 minutes**.
- **Behavior**: While data is fresh, navigating between pages is instantaneous and makes **zero network requests** to the backend.
 
#### Configuration
You can adjust how frequently the client refetches data by modifying `STALE_TIME` in `app/lib/query-config.ts`.
 
---
 
## Display Modes
 
### Info Reel (Kiosk Mode)

The application includes an "Info Reel" mode designed for public displays or kiosks. In this mode:
- The application automatically cycles through all main pages (`/`, `/events`, `/treasury`, `/minutes`, `/inventory`, `/social`) every 30 seconds.
- A visual progress bar at the bottom indicates the time remaining before the next transition.
- Decorative elements like "Open Link" buttons and the "Login" navigation item are hidden for a cleaner look.

To activate Info Reel mode, append `?view=infoReel` to any URL:
`http://localhost:5173/?view=infoReel`

---

Built with ❤️ using React Router.
