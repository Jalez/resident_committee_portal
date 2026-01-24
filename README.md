# Resident Committee Portal

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FJalez%2Fresident_committee_portal)

A modern, production-ready portal designed for resident committees and tenant associations. This platform streamlines communication between residents and their representatives, providing tools for involvement, transparency, and administrative management.

The objective of this project is to provide a generic, easily deployable template that any resident committee can use to manage their community engagement.

---

## Key Features

- **Resident Involvement**: Integrated forms for committee applications, event suggestions, and purchase requests.
- **Event Management**: Up-to-date view of upcoming community events (integrated with Google Calendar).
- **Transparency**: Easy access to meeting minutes, treasury records, and public documents.
- **Social Integration**: Dynamic social media links managed via Google Sheets.
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

4.  **Create a Service Account** (for writing form submissions):
    - In Google Cloud Console -> IAM & Admin -> Service Accounts
    - Click "Create Service Account"
    - Give it a name (e.g., "Committee Portal")
    - Click "Create and Continue" (skip optional steps)
    - Click on the service account "..." -> Manage Keys -> Add Key -> Create New Key -> JSON
    - Download the JSON file
    - From the JSON, copy:
        - `client_email` -> `GOOGLE_SERVICE_ACCOUNT_EMAIL`
        - `private_key` -> `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (replace newlines with `\n`)



5.  **Permissions Summary**:
    - Calendar: Make public (for event display)
    - Public folder: Share with "Anyone with the link" (Viewer)
 
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
