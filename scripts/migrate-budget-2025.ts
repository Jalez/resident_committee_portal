
import 'dotenv/config';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase } from '../app/db/index';
// @ts-ignore
import type { NewTransaction } from '../app/db/schema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.join(__dirname, '../app/data/2025_budget.xlsx');

async function migrate() {
    console.log('Starting migration...');
    const db = getDatabase();

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // Read raw values to determine types manually
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    let count = 0;

    // Iterate rows, skipping header (index 0)
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        // Columns based on inspection:
        // 0: Tosite (Voucher)
        // 1: Päiväys (Serial Date)
        // 2: Selite (Description)
        // 3: Tiedot (Details/Person)
        // 4: Calc (Ignore)
        // 5: Tulot (Income)
        // 6: Menot (Expense)

        const serialDate = row[1];
        const selite = row[2];
        const tiedot = row[3];
        const tulot = row[5];
        const menot = row[6];

        // Skip rows without date
        if (typeof serialDate !== 'number') continue;

        // Determine type and amount
        let type: 'income' | 'expense' | null = null;
        let amount = 0;

        if (typeof tulot === 'number' && tulot > 0) {
            type = 'income';
            amount = tulot;
        } else if (typeof menot === 'number' && menot > 0) {
            type = 'expense';
            amount = menot;
        } else {
            // Check if there is a calc value that implies something, or just skip
            // Based on inspection, expenses are in col 6 and income in col 5. 
            // If neither is present, it's not a transaction.
            continue;
        }

        // Excel date conversion
        // (Serial - 25569) * 86400 * 1000 gives milliseconds since 1970-01-01
        const jsDate = new Date(Math.round((serialDate - 25569) * 86400 * 1000));

        // Construct description
        const parts = [selite, tiedot].filter(p => p && String(p).trim().length > 0);
        const description = parts.join(', ');

        const transaction: NewTransaction = {
            year: 2025,
            type: type,
            amount: amount.toFixed(2),
            description: description || 'No description',
            date: jsDate,
            category: null, // Let it be null or default
        };

        try {
            await db.createTransaction(transaction);
            process.stdout.write('.');
            count++;
        } catch (e) {
            console.error(`\nFailed to insert row ${i + 1}:`, e);
        }
    }

    console.log(`\nMigration completed. Successfully migrated ${count} transactions.`);
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
