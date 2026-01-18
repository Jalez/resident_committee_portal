
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '../app/data/2025_budget.xlsx');

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert to JSON to see the structure
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    console.log(`Sheet Name: ${sheetName}`);
    console.log('First 10 rows:');
    console.log(JSON.stringify(data.slice(0, 10), null, 2));

} catch (error) {
    console.error('Error reading file:', error);
}
