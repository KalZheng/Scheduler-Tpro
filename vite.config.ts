import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

// Custom plugin to handle local database file read/write partitioned by month
function localDbPlugin() {
  const dataDir = path.resolve(__dirname, 'data');
  const legacyPath = path.resolve(dataDir, 'db.json');

  // Migrate legacy data/db.json to monthly data/db-YYYY-MM.json & data/db-global.json
  const migrateLegacyDb = () => {
    if (fs.existsSync(legacyPath)) {
      try {
        console.log("Migrating legacy db.json to monthly partition files...");
        const raw = fs.readFileSync(legacyPath, 'utf-8');
        const legacyData = JSON.parse(raw);
        
        // Group schedules by month
        const schedulesByMonth: Record<string, any[]> = {};
        (legacyData.schedules || []).forEach((s: any) => {
          const m = s.date ? s.date.substring(0, 7) : 'global';
          if (!schedulesByMonth[m]) schedulesByMonth[m] = [];
          schedulesByMonth[m].push(s);
        });

        // Group availabilities by month
        const availsByMonth: Record<string, any[]> = {};
        (legacyData.availabilities || []).forEach((a: any) => {
          const m = a.date ? a.date.substring(0, 7) : 'global';
          if (!availsByMonth[m]) availsByMonth[m] = [];
          availsByMonth[m].push(a);
        });

        // Group staffing targets
        const globalTargets: any[] = [];
        const targetsByMonth: Record<string, any[]> = {};
        (legacyData.staffingTargets || []).forEach((t: any) => {
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
          ...Object.keys(availsByMonth),
          ...Object.keys(targetsByMonth)
        ]);

        // Write each month's file
        allMonths.forEach(m => {
          if (m === 'global' || !/^\d{4}-\d{2}$/.test(m)) return;
          const monthPath = path.resolve(dataDir, `db-${m}.json`);
          const monthData = {
            schedules: schedulesByMonth[m] || [],
            availabilities: availsByMonth[m] || [],
            staffingTargets: targetsByMonth[m] || []
          };
          fs.writeFileSync(monthPath, JSON.stringify(monthData, null, 2), 'utf-8');
        });

        // Write global targets
        const globalPath = path.resolve(dataDir, 'db-global.json');
        fs.writeFileSync(globalPath, JSON.stringify({ staffingTargets: globalTargets }, null, 2), 'utf-8');

        // Backup legacy file
        const backupPath = path.resolve(dataDir, 'db-backup.json');
        fs.renameSync(legacyPath, backupPath);
        console.log("Migration to monthly partitions completed successfully!");
      } catch (e) {
        console.error("Migration to monthly partitions failed:", e);
      }
    }
  };

  return {
    name: 'local-db-plugin',
    configureServer(server: any) {
      // Ensure data directory exists
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Proactively run migration
      migrateLegacyDb();

      // Proactively migrate employees from db-global.json to db-employees.json
      const globalPath = path.resolve(dataDir, 'db-global.json');
      const employeesPath = path.resolve(dataDir, 'db-employees.json');
      if (fs.existsSync(globalPath) && !fs.existsSync(employeesPath)) {
        try {
          console.log("[localDbPlugin] Checking for employees data in db-global.json to migrate...");
          const globalRaw = fs.readFileSync(globalPath, 'utf-8');
          const globalData = JSON.parse(globalRaw);
          if (globalData.employees) {
            fs.writeFileSync(employeesPath, JSON.stringify({ employees: globalData.employees }, null, 2), 'utf-8');
            delete globalData.employees;
            fs.writeFileSync(globalPath, JSON.stringify(globalData, null, 2), 'utf-8');
            console.log("[localDbPlugin] Successfully migrated employees to db-employees.json");
          }
        } catch (e) {
          console.error("[localDbPlugin] Migration of employees failed:", e);
        }
      }

      server.middlewares.use((req: any, res: any, next: any) => {
        console.log(`[localDbPlugin] Incoming: ${req.method} ${req.url}`);
        if (req.url && req.url.startsWith('/api/db')) {
          const urlObj = new URL(req.url, 'http://localhost');
          const month = urlObj.searchParams.get('month') || new Date().toISOString().substring(0, 7);
          
          if (!/^\d{4}-\d{2}$/.test(month)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid month format, expected YYYY-MM' }));
            return;
          }

          if (req.method === 'GET') {
            try {
              const monthPath = path.resolve(dataDir, `db-${month}.json`);
              let monthData = { schedules: [], availabilities: [], staffingTargets: [] };
              if (fs.existsSync(monthPath)) {
                monthData = JSON.parse(fs.readFileSync(monthPath, 'utf-8'));
              }

              const globalPath = path.resolve(dataDir, 'db-global.json');
              let globalTargets = [];
              let deadlineDay = 20;
              if (fs.existsSync(globalPath)) {
                const globalData = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
                globalTargets = globalData.staffingTargets || [];
                if (globalData.deadlineDay !== undefined) {
                  deadlineDay = globalData.deadlineDay;
                }
              } else {
                // Initialize default staffing targets if global doesn't exist
                globalTargets = Array.from({ length: 14 }, (_, i) => ({
                  id: `hour-${i + 6}`,
                  hour: i + 6,
                  targetCount: 2
                }));
                fs.writeFileSync(globalPath, JSON.stringify({ staffingTargets: globalTargets, deadlineDay }, null, 2), 'utf-8');
              }

              const employeesPath = path.resolve(dataDir, 'db-employees.json');
              let globalEmployees = [];
              if (fs.existsSync(employeesPath)) {
                const employeesData = JSON.parse(fs.readFileSync(employeesPath, 'utf-8'));
                globalEmployees = employeesData.employees || [];
              } else {
                fs.writeFileSync(employeesPath, JSON.stringify({ employees: [] }, null, 2), 'utf-8');
              }

              // Merge staffingTargets
              const mergedTargets = [
                ...globalTargets,
                ...(monthData.staffingTargets || [])
              ];

              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({
                schedules: monthData.schedules || [],
                availabilities: monthData.availabilities || [],
                staffingTargets: mergedTargets,
                employees: globalEmployees,
                deadlineDay: deadlineDay
              }));
            } catch (error) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Failed to read database files' }));
            }
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: any) => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body);
                
                // Separate targets: global (no date) vs month-specific (with date matching YYYY-MM)
                const monthTargets: any[] = [];
                const globalTargets: any[] = [];
                
                (parsed.staffingTargets || []).forEach((t: any) => {
                  if (t.date) {
                    if (t.date.startsWith(month)) {
                      monthTargets.push(t);
                    } else {
                      // Keep it in case there are targets for other months (shouldn't happen in single month payload, but for safety)
                      monthTargets.push(t);
                    }
                  } else {
                    globalTargets.push(t);
                  }
                });

                // Write month file
                const monthPath = path.resolve(dataDir, `db-${month}.json`);
                const monthData = {
                  schedules: parsed.schedules || [],
                  availabilities: parsed.availabilities || [],
                  staffingTargets: monthTargets
                };
                
                fs.writeFileSync(monthPath, JSON.stringify(monthData, null, 2), 'utf-8');

                // Write global file
                const globalPath = path.resolve(dataDir, 'db-global.json');
                fs.writeFileSync(globalPath, JSON.stringify({ 
                  staffingTargets: globalTargets,
                  deadlineDay: parsed.deadlineDay !== undefined ? parsed.deadlineDay : 20
                }, null, 2), 'utf-8');

                // Write employees file
                const employeesPath = path.resolve(dataDir, 'db-employees.json');
                fs.writeFileSync(employeesPath, JSON.stringify({
                  employees: parsed.employees || []
                }, null, 2), 'utf-8');

                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true }));
              } catch (error) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Failed to write database files' }));
              }
            });
            return;
          }
        }

        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  // Base path for GitHub Pages: https://kalzheng.github.io/Scheduler-Tpro/
  base: '/Scheduler-Tpro/',
  plugins: [react(), tailwindcss(), localDbPlugin()],
  server: {
    watch: {
      ignored: ['**/data/**']
    }
  }
})
