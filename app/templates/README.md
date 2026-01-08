# Hippos Portal Templates

This directory contains template files and instructions for maintaining the data used by the Hippos Portal application.

## Folder Structure

The application now reads from a single **Root Folder** in Google Drive defined by `GOOGLE_DRIVE_ROOT_ID`.

**Expected Structure:**
```
ROOT_FOLDER/
├── 2026/
│   ├── budget (Google Sheet)
│   └── minutes/ (Folder)
│       ├── 2026-01-05_Meeting.pdf
│       └── ...
├── 2027/
│   └── ...
```

## 1. Budget (`budget.csv`)

This file is a template for the yearly budget.

### Instructions:
1.  Inside the current year's folder (e.g., `2026`), create a **New Google Sheet** named `budget`.
2.  **Import** (`File > Import`) the `budget.csv` file into this sheet.
3.  **Fill in the values** in Column B:
    *   **B2**: Remaining Budget
    *   **B3**: Total Budget
    *   **B4**: Last Updated Date
4.  The application will automatically find this file (`budget`) inside the year folder (`2026`).

## 2. Minutes (`minutes_convention.md`)

Refer to `minutes_convention.md` for details on how to name your PDF files inside the `minutes` folder of the current year.
