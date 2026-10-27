import * as XLSX from 'xlsx-js-style';
import type { WorkSchedule } from '../services/scheduler';
import { getColorFromName } from './dateUtils';

export interface ParseSampleExcelResult {
  extractedMonthStr: string;
  schedules: WorkSchedule[];
  employeeCount: number;
  totalShiftsCount: number;
}

const SAMPLE_STORAGE_KEY = 'comparison_sample_manual_schedules';

/**
 * Parse a standard comparison schedule Excel file (e.g. Table 1 export format)
 * into WorkSchedule items for simulation comparison without writing to Firestore.
 */
export function parseComparisonSampleExcel(
  arrayBuffer: ArrayBuffer,
  fallbackMonthStr: string
): ParseSampleExcelResult {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Excel 檔案內未找到任何工作表。');
  }

  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (!rows || rows.length < 2) {
    throw new Error('檔案內容行數不足，請確認是否為標準比對排班表格式。');
  }

  // 1. Try to extract target month (YYYY-MM) from top title rows (e.g. "排班表 (2026-11 上半月 (1~15日))")
  let extractedMonthStr = fallbackMonthStr;
  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const rowStr = rows[r].join(' ');
    const match = rowStr.match(/\b(20\d{2})[-/年](\d{1,2})\b/);
    if (match) {
      const year = match[1];
      const month = String(parseInt(match[2], 10)).padStart(2, '0');
      extractedMonthStr = `${year}-${month}`;
      break;
    }
  }

  const [targetYear, targetMonth] = extractedMonthStr.split('-').map(Number);

  // 2. Locate header row: contains "人員姓名" or "姓名"
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(rows.length, 8); r++) {
    const row = rows[r];
    if (
      row &&
      row.some((cell: any) => {
        const str = String(cell).trim();
        return str.includes('人員姓名') || str === '姓名' || str.includes('姓名');
      })
    ) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error('未找到包含「人員姓名」的表頭欄位。');
  }

  const headerRow = rows[headerRowIdx];

  // 3. Extract date columns: columns with day numbers (e.g. "1日", "2日 (週一)", "11/01", etc.)
  interface DateCol {
    colIdx: number;
    dateStr: string;
    dayNum: number;
  }
  const dateCols: DateCol[] = [];

  for (let c = 0; c < headerRow.length; c++) {
    const cellText = String(headerRow[c] || '').trim();
    if (!cellText) continue;
    if (
      cellText.includes('人員姓名') ||
      cellText.includes('身分') ||
      cellText.includes('總工時') ||
      cellText.includes('合計')
    ) {
      continue;
    }

    // Try matching day number: "1日", "15日", "1", "11/01", etc.
    let dayNum: number | null = null;
    const dayMatch = cellText.match(/^(\d{1,2})\s*日/) || cellText.match(/(\d{1,2})\s*日/);
    if (dayMatch) {
      dayNum = parseInt(dayMatch[1], 10);
    } else {
      const mmddMatch = cellText.match(/(?:\d{1,2})[\/\-](\d{1,2})/);
      if (mmddMatch) {
        dayNum = parseInt(mmddMatch[1], 10);
      } else {
        const numOnlyMatch = cellText.match(/^(\d{1,2})$/);
        if (numOnlyMatch) {
          dayNum = parseInt(numOnlyMatch[1], 10);
        }
      }
    }

    if (dayNum !== null && dayNum >= 1 && dayNum <= 31) {
      const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      dateCols.push({ colIdx: c, dateStr, dayNum });
    }
  }

  if (dateCols.length === 0) {
    throw new Error('未能在表頭中辨識出任何日期欄位（如 1日、2日...）。');
  }

  // 4. Parse employee schedule rows
  const schedules: WorkSchedule[] = [];
  const parsedEmployees = new Set<string>();

  // Skip summary row names
  const summaryKeywords = [
    '出勤人數',
    '當日總工時',
    '開早人數',
    '收班人數',
    '營業無人時段',
    '合計',
    '目標',
    '總計',
    '時段',
    '缺額'
  ];

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const rawName = String(row[0] || '').trim();
    if (!rawName) continue;
    if (summaryKeywords.some(k => rawName.includes(k))) continue;

    const empName = rawName;
    parsedEmployees.add(empName);

    for (const dCol of dateCols) {
      const cellVal = String(row[dCol.colIdx] || '').trim();
      if (
        !cellVal ||
        cellVal === '—' ||
        cellVal === '-' ||
        cellVal === 'RO' ||
        cellVal === 'X' ||
        cellVal === '休'
      ) {
        continue;
      }

      // Regex to find shift intervals: e.g. "09:30-18:30" or "06:30-12:00"
      const shiftRegex = /(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})/g;
      let match;

      // Extract optional note inside parentheses: "(月初寄資料)" or "(13:30後)"
      let note = '';
      const noteMatch = cellVal.match(/[\(（](.+?)[\)）]/);
      if (noteMatch) {
        note = noteMatch[1].trim();
      }

      while ((match = shiftRegex.exec(cellVal)) !== null) {
        const startTime = match[1].padStart(5, '0');
        const endTime = match[2].padStart(5, '0');

        schedules.push({
          id: `sample-${empName}-${dCol.dateStr}-${startTime}`,
          title: empName,
          employeeName: empName,
          date: dCol.dateStr,
          workplace: '門市',
          startTime,
          endTime,
          color: getColorFromName(empName),
          notes: note,
          managerNotes: note,
          createdAt: Date.now(),
          scheduleSource: 'manual'
        });
      }
    }
  }

  return {
    extractedMonthStr,
    schedules,
    employeeCount: parsedEmployees.size,
    totalShiftsCount: schedules.length
  };
}

/**
 * Storage helpers for isolated sample manual schedules in browser localStorage.
 * Ensures zero contamination of live database / Firestore.
 */
export function getStoredSampleSchedules(): WorkSchedule[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(SAMPLE_STORAGE_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to load sample schedules from localStorage:', e);
    return [];
  }
}

export function saveStoredSampleSchedules(schedules: WorkSchedule[]): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SAMPLE_STORAGE_KEY, JSON.stringify(schedules));
    }
  } catch (e) {
    console.error('Failed to save sample schedules to localStorage:', e);
  }
}

export function clearStoredSampleSchedules(monthPrefix?: string): void {
  try {
    if (typeof window === 'undefined') return;
    if (!monthPrefix) {
      localStorage.removeItem(SAMPLE_STORAGE_KEY);
    } else {
      const current = getStoredSampleSchedules();
      const filtered = current.filter(s => !s.date || !s.date.startsWith(monthPrefix));
      saveStoredSampleSchedules(filtered);
    }
  } catch (e) {
    console.error('Failed to clear sample schedules from localStorage:', e);
  }
}
