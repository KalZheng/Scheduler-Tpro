import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Allow passing env file name as CLI arg e.g. node scripts/pull_from_firestore.mjs .env.puli-production
const requestedEnv = process.argv[2] || '.env.puli-production';
let envPath = path.resolve(rootDir, requestedEnv);

if (!fs.existsSync(envPath)) {
    console.warn(`⚠️ Specified env file '${requestedEnv}' not found, checking .env.local...`);
    envPath = path.resolve(rootDir, '.env.local');
}

if (fs.existsSync(envPath)) {
    console.log(`📄 Loading environment variables from: ${path.basename(envPath)}`);
    dotenv.config({ path: envPath, override: true });
} else {
    dotenv.config({ override: true });
}

const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID
};

if (!firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('YOUR_')) {
    console.error(`❌ Error: Valid Firebase credentials not found in ${path.basename(envPath)}!`);
    console.error('Please make sure VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, etc. are configured.');
    process.exit(1);
}

console.log(`🔥 Connecting to Firebase project: ${firebaseConfig.projectId}...`);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const dataDir = path.resolve(rootDir, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

async function pullData() {
    try {
        // 1. Fetch Schedules
        console.log('📥 Fetching schedules...');
        const schedulesSnap = await getDocs(collection(db, 'schedules'));
        const schedules = schedulesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 2. Fetch Availabilities
        console.log('📥 Fetching availabilities...');
        const availSnap = await getDocs(collection(db, 'availabilities'));
        const availabilities = availSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 3. Fetch Staffing Targets
        console.log('📥 Fetching staffing targets...');
        const targetsSnap = await getDocs(collection(db, 'staffing_targets'));
        const staffingTargets = targetsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 4. Fetch Employees
        console.log('📥 Fetching employees...');
        const empSnap = await getDocs(collection(db, 'employees'));
        const employees = empSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 5. Fetch Global Settings
        console.log('📥 Fetching global settings...');
        let globalSettings = {};
        try {
            const globalDoc = await getDoc(doc(db, 'settings', 'global'));
            if (globalDoc.exists()) {
                globalSettings = globalDoc.data();
            }
        } catch (e) {
            console.warn('⚠️  Could not fetch global settings doc:', e.message);
        }

        // Group schedules by YYYY-MM
        const schedulesByMonth = {};
        schedules.forEach(s => {
            const m = s.date ? s.date.substring(0, 7) : 'global';
            if (!schedulesByMonth[m]) schedulesByMonth[m] = [];
            schedulesByMonth[m].push(s);
        });

        // Group availabilities by YYYY-MM
        const availabilitiesByMonth = {};
        availabilities.forEach(a => {
            const m = a.date ? a.date.substring(0, 7) : 'global';
            if (!availabilitiesByMonth[m]) availabilitiesByMonth[m] = [];
            availabilitiesByMonth[m].push(a);
        });

        // Group staffing targets
        const targetsByMonth = {};
        const globalTargets = [];
        staffingTargets.forEach(t => {
            if (t.date) {
                const m = t.date.substring(0, 7);
                if (!targetsByMonth[m]) targetsByMonth[m] = [];
                targetsByMonth[m].push(t);
            } else {
                globalTargets.push(t);
            }
        });

        // Get all unique months
        const allMonths = new Set([
            ...Object.keys(schedulesByMonth),
            ...Object.keys(availabilitiesByMonth),
            ...Object.keys(targetsByMonth)
        ]);

        if (allMonths.size === 0) {
            allMonths.add(new Date().toISOString().substring(0, 7));
        }

        let savedCount = 0;
        allMonths.forEach(m => {
            if (m === 'global' || !/^\d{4}-\d{2}$/.test(m)) return;
            const monthPath = path.resolve(dataDir, `db-${m}.json`);
            
            let monthData = { schedules: [], availabilities: [], staffingTargets: [] };
            if (fs.existsSync(monthPath)) {
                try {
                    monthData = JSON.parse(fs.readFileSync(monthPath, 'utf-8'));
                } catch { }
            }

            monthData.schedules = schedulesByMonth[m] || monthData.schedules || [];
            monthData.availabilities = availabilitiesByMonth[m] || monthData.availabilities || [];
            monthData.staffingTargets = targetsByMonth[m] || monthData.staffingTargets || [];

            fs.writeFileSync(monthPath, JSON.stringify(monthData, null, 2), 'utf-8');
            console.log(`✅ Saved data/db-${m}.json (${monthData.schedules.length} schedules, ${monthData.availabilities.length} availabilities)`);
            savedCount++;
        });

        // Write db-employees.json
        const empPath = path.resolve(dataDir, 'db-employees.json');
        fs.writeFileSync(empPath, JSON.stringify({ employees }, null, 2), 'utf-8');
        console.log(`✅ Saved data/db-employees.json (${employees.length} employees)`);

        // Write db-global.json
        const globalPath = path.resolve(dataDir, 'db-global.json');
        const globalData = {
            staffingTargets: globalTargets,
            deadlineDay: globalSettings.deadlineDay ?? 20,
            startDay: globalSettings.startDay ?? 15,
            operatingStartTime: globalSettings.operatingStartTime ?? '06:30',
            operatingEndTime: globalSettings.operatingEndTime ?? '20:00',
            shiftMorningStart: globalSettings.shiftMorningStart ?? '06:30',
            shiftMorningEnd: globalSettings.shiftMorningEnd ?? '15:30',
            shiftEveningStart: globalSettings.shiftEveningStart ?? '08:30',
            shiftEveningEnd: globalSettings.shiftEveningEnd ?? '17:30',
            shiftPresets: globalSettings.shiftPresets ?? [
                { name: '早班', startTime: '06:30', endTime: '15:30' },
                { name: '晚班', startTime: '08:30', endTime: '17:30' }
            ],
            employeeOrder: globalSettings.employeeOrder ?? [],
            monthlyRevenues: globalSettings.monthlyRevenues ?? {},
            revenueStaffRules: globalSettings.revenueStaffRules ?? {
                tier1Limit: 1500,
                tier2Limit: 2500,
                tier3Limit: 3500,
                tier1Staff: 2,
                tier2Staff: 3,
                tier3Staff: 4,
                tier4Staff: 5,
                incrementAmount: 1000,
                maxStaff: 8
            }
        };
        fs.writeFileSync(globalPath, JSON.stringify(globalData, null, 2), 'utf-8');
        console.log(`✅ Saved data/db-global.json`);

        console.log(`\n🎉 Success! Grabbed ${schedules.length} schedules, ${availabilities.length} availabilities, and ${employees.length} employees from Firestore using ${path.basename(envPath)}.`);
        console.log(`All data saved to local data/ JSON files.`);

    } catch (err) {
        console.error('❌ Failed to pull data from Firestore:', err);
        process.exit(1);
    }
}

pullData().then(() => {
    process.exit(0);
});
