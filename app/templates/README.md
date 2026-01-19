# Portal Templates

This directory contains template files and instructions for maintaining the data used by the Resident Committee Portal application.

## Folder Structure

The application reads from a **Root Folder** in Google Drive defined by `GOOGLE_DRIVE_PUBLIC_ROOT_ID`.

**Expected Structure:**
```
ROOT_FOLDER/
├── 2026/
│   └── minutes/ (Folder)
│       ├── 2026-01-05_Meeting.pdf
│       └── ...
├── 2027/
│   └── ...
```

> **Note**: Treasury/budget data is now managed in the database via the `/treasury` routes, not via Google Sheets.

## 1. Minutes (`minutes_convention.md`)

Refer to `minutes_convention.md` for details on how to name your PDF files inside the `minutes` folder of the current year.

## 2. Inventory (`inventory.csv`)

This file is a template for bulk-importing inventory items.

### Instructions:
1.  Use this CSV to import existing inventory data via the inventory import feature in the app.
2.  **Columns**:
    *   **Column A (Item Name)**: Name of the item (e.g., "Projector", "Sound System")
    *   **Column B (Quantity)**: Number of items
    *   **Column C (Location)**: Where it's stored (e.g., "Storage Room", "Office")
    *   **Column D (Category)**: Category (e.g., "Electronics", "Furniture", "Kitchen")
    *   **Column E (Description)**: Brief description of the item
    *   **Column F (Value)**: Estimated value in euros

> **Note**: The public Info Reel shows only items marked with `showInInfoReel = true`. Inventory is now fully managed in the database via `/inventory` routes.
