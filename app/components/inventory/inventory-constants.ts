import type { InventoryItem } from "~/db";

export const PAGE_SIZE = 20;

// Column keys that can be toggled
export const COLUMN_KEYS = ["status", "name", "quantity", "location", "category", "description", "updatedAt", "unitValue", "totalValue", "transactions", "showInInfoReel"] as const;
export type ColumnKey = typeof COLUMN_KEYS[number];

export const COLUMN_LABELS: Record<ColumnKey, string> = {
    status: "Tila / Status",
    name: "Nimi / Name",
    quantity: "Määrä / Qty",
    location: "Sijainti / Location",
    category: "Kategoria / Category",
    description: "Kuvaus / Description",
    updatedAt: "Päivitetty / Updated",
    unitValue: "Kpl-arvo / Unit Value",
    totalValue: "Yht. arvo / Total Value",
    transactions: "Tapahtumat / Transactions",
    showInInfoReel: "Info Reel",
};

// New item default state
export interface NewInventoryItemState {
    name: string;
    quantity: string;
    location: string;
    category: string;
    description: string;
    value: string;
    showInInfoReel: boolean;
}

export const DEFAULT_NEW_ITEM: NewInventoryItemState = {
    name: "",
    quantity: "1",
    location: "",
    category: "",
    description: "",
    value: "0",
    showInInfoReel: false,
};
