# Welcome to React Router!

A modern, production-ready template for building full-stack React applications using React Router.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/remix-run/react-router-templates/tree/main/default)

## Features

- 🚀 Server-side rendering
- ⚡️ Hot Module Replacement (HMR)
- 📦 Asset bundling and optimization
- 🔄 Data loading and mutations
- 🔒 TypeScript by default
- 🎉 TailwindCSS for styling
- 📖 [React Router docs](https://reactrouter.com/)

## Getting Started

### Installation

Install the dependencies:

```bash
npm install
```

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

### Docker Deployment

To build and run using Docker:

```bash
docker build -t my-app .

# Run the container
docker run -p 3000:3000 my-app
```

The containerized application can be deployed to any platform that supports Docker, including:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### DIY Deployment

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of `npm run build`

```
├── package.json
├── package-lock.json (or pnpm-lock.yaml, or bun.lockb)
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.

## Google Services Integration

This project integrates with Google Calendar, Drive, and Sheets to display dynamic content. To enable these features, you need to set up Google Cloud credentials.

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
        - **Google Sheets API**
    - Create credentials -> API Key.
    - Paste this key into `GOOGLE_API_KEY` in your `.env` file.

3.  **Get ID's**:
    - **Calendar ID**: Open Google Calendar settings -> Integrate calendar -> Calendar ID.
    
    - **Public Root Folder ID** (`GOOGLE_DRIVE_PUBLIC_ROOT_ID`): 
        - Create a root folder (e.g., "Committe Public Folder") in Google Drive.
        - Inside it, create folders for each year (e.g., "2026").
        - Inside a year folder (e.g. "2026"), create:
             - A Google Sheet named `budget` (import the template).
             - A folder named `minutes`.
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

5.  **Create Submissions Sheet** (`GOOGLE_SUBMISSIONS_SHEET_ID`):
    - Create a new Google Sheet (e.g., "Form Submissions")
    - Add headers in row 1: `Timestamp | Type | Name | Email | Message | Status`
    - **Share this sheet with your service account email** (as Editor)
    - Get the Sheet ID from the URL and paste into `GOOGLE_SUBMISSIONS_SHEET_ID`
    
    **Status Values** (for the board/tracking):
    - `Uusi / New` - Just submitted, not yet reviewed
    - `Käsittelyssä / In Progress` - Being reviewed/worked on
    - `Hyväksytty / Approved` - Approved (for applications, event suggestions, purchases)
    - `Hylätty / Rejected` - Rejected/declined
    - `Valmis / Done` - Fully completed/resolved

6.  **Permissions Summary**:
    - Calendar: Make public (for event display)
    - Public folder: Share with "Anyone with the link" (Viewer)
    - Submissions sheet: Share with service account email (Editor)

---

Built with ❤️ using React Router.
