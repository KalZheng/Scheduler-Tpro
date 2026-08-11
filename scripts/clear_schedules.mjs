import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.resolve(rootDir, 'data');

const files = fs.readdirSync(dataDir).filter(f => f.startsWith('db-202') && f.endsWith('.json'));

let totalClearedSchedules = 0;
let totalPreservedAvailabilities = 0;

files.forEach(file => {
    const filePath = path.resolve(dataDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    const removedCount = (data.schedules || []).length;
    totalClearedSchedules += removedCount;

    // Clear all confirmed work schedules
    data.schedules = [];

    if (data.availabilities) {
        // Filter out leftover fragment entries created by auto-schedule splitting ("未排入剩餘時間段")
        const mainAvails = data.availabilities.filter(
            a => !a.notes || !a.notes.includes('未排入剩餘時間段')
        );

        // Deduplicate per (employeeName + date), keeping the cleanest record
        const map = new Map();
        mainAvails.forEach(a => {
            if (!a.employeeName || !a.date) return;
            const key = `${a.employeeName.trim().toLowerCase()}_${a.date}`;
            if (!map.has(key)) {
                const { confirmed, ...clean } = a;
                map.set(key, clean);
            }
        });

        data.availabilities = Array.from(map.values());
        totalPreservedAvailabilities += data.availabilities.length;
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`🧹 Cleared ${removedCount} confirmed work schedules from ${file}. Preserved ${data.availabilities?.length || 0} unique available times.`);
});

console.log(`\n✅ Done! Cleared total ${totalClearedSchedules} confirmed work times. Cleaned & preserved ${totalPreservedAvailabilities} unique registered available times.`);
