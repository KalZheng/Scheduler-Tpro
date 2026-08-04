import * as XLSX from 'xlsx-js-style';
import type { WorkSchedule, WorkerAvailability, Employee } from '../services/scheduler';
import { DAYS_OF_WEEK } from './constants';
import { formatDateString, getDatesInRange, calculateDuration, getCleanNote, compareTimeStrings } from './dateUtils';

interface GenerateExcelParams {
  exportStartDate: string;
  exportEndDate: string;
  schedules: WorkSchedule[];
  availabilities: WorkerAvailability[];
  allEmployees: string[];
  employees: Employee[];
  markedEmptyCells: Record<string, boolean>;
  getDayNote: (dateStr: string) => string;
  erpDays?: number[];
  filenamePrefix?: string;
  customPrefix?: string;
  storeName?: string;
}

export const generateExcelWorkbook = ({
  exportStartDate,
  exportEndDate,
  schedules,
  availabilities,
  allEmployees,
  employees,
  markedEmptyCells,
  getDayNote,
  erpDays = [1, 3, 5],
  filenamePrefix,
  customPrefix,
  storeName
}: GenerateExcelParams): { wb: XLSX.WorkBook; filename: string } | null => {
  if (!exportStartDate || !exportEndDate) {
    alert('請先選擇匯出的日期範圍。');
    return null;
  }

  const start = new Date(exportStartDate);
  const end = new Date(exportEndDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    alert('請輸入有效的日期範圍。');
    return null;
  }

  const exportDates = getDatesInRange(exportStartDate, exportEndDate);
  if (exportDates.length === 0) {
    alert('選擇的日期範圍內沒有日期。');
    return null;
  }

  const exportSchedules = schedules.filter(item => {
    return item.date && item.date >= exportStartDate && item.date <= exportEndDate;
  });

  if (exportSchedules.length === 0) {
    alert('在此日期範圍內尚無排班資料可供匯出。');
    return null;
  }

  const getDayOfWeekName = (dateStr: string): string => {
    if (!dateStr) return '';
    const parts = dateStr.split('-').map(Number);
    if (parts.length < 3) return '';
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    const dayIdx = dateObj.getDay();
    const mapped = dayIdx === 0 ? 7 : dayIdx;
    const match = DAYS_OF_WEEK.find(d => d.value === mapped);
    return match ? match.name : '';
  };

  const dateHeaders = exportDates.map(dateObj => {
    const dateStr = formatDateString(dateObj);
    const dayName = getDayOfWeekName(dateStr);
    const parts = dateStr.split('-');
    const mmdd = parts.length >= 3 ? `${parts[1]}/${parts[2]}` : dateStr;
    const dayOfWeekIndex = dateObj.getDay();
    const mappedDayIndex = dayOfWeekIndex === 0 ? 7 : dayOfWeekIndex;
    const isERP = erpDays.includes(mappedDayIndex);
    const customNote = getDayNote(dateStr);

    let headerVal = isERP ? `${mmdd}\n(${dayName} ERP)` : `${mmdd}\n(${dayName})`;
    if (customNote) {
      headerVal += `\n[${customNote}]`;
    }
    return headerVal;
  });

  const headers = ['人員姓名', ...dateHeaders, '總工時(hrs)'];
  const rows: string[][] = [];
  const redFontCells = new Set<string>();
  const markedBlueCells = new Set<string>();

  allEmployees.forEach((empName, empIdx) => {
    let totalHours = 0;

    const dateCells = exportDates.map((dateObj, dateIdx) => {
      const dateStr = formatDateString(dateObj);
      const empSchedules = schedules.filter(
        s => s.employeeName.trim().toLowerCase() === empName.trim().toLowerCase() && s.date === dateStr
      ).sort((a, b) => compareTimeStrings(a.startTime, b.startTime));

      const empAvailabilities = availabilities.filter(
        a => a.employeeName.trim().toLowerCase() === empName.trim().toLowerCase() && a.date === dateStr
      );

      const registeredToWork = empAvailabilities.some(a => !(a.startTime === '00:00' && a.endTime === '00:00'));

      const cellKey = `${empName.trim().toLowerCase()}|${dateStr}`;
      const hasMarkedBlue = empSchedules.some(s => s.markedBlue) || !!markedEmptyCells[cellKey];
      if (hasMarkedBlue) {
        const cellRef = XLSX.utils.encode_cell({ r: empIdx + 1, c: dateIdx + 1 });
        markedBlueCells.add(cellRef);
      }

      empSchedules.forEach(sched => {
        totalHours += calculateDuration(sched.startTime, sched.endTime);
      });

      if (empSchedules.length === 0) {
        const cellRef = XLSX.utils.encode_cell({ r: empIdx + 1, c: dateIdx + 1 });
        redFontCells.add(cellRef);
        return registeredToWork ? 'X' : 'RO';
      }

      return empSchedules.map(sched => {
        const note = getCleanNote(sched.notes);
        return note
          ? `${sched.startTime}-${sched.endTime}\n(${note})`
          : `${sched.startTime}-${sched.endTime}`;
      }).join('\n');
    });

    const totalHoursStr = totalHours > 0 ? `${Math.round(totalHours * 10) / 10}` : '';
    const row = [empName, ...dateCells, totalHoursStr];
    rows.push(row);
  });

  const aoaData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoaData);

  for (const cellRef in ws) {
    if (cellRef[0] === '!') continue;
    if (ws[cellRef]) {
      const decoded = XLSX.utils.decode_cell(cellRef);
      const { r, c } = decoded;
      const isRedFont = redFontCells.has(cellRef);
      const isMarkedBlue = markedBlueCells.has(cellRef);

      let isNewcomer = false;
      if (r > 0) {
        const empName = allEmployees[r - 1];
        if (empName) {
          const empObj = employees.find(e => e.name.trim().toLowerCase() === empName.trim().toLowerCase());
          isNewcomer = empObj ? !!empObj.isNewcomer : false;
        }
      }

      let isWeekend = false;
      if (c > 0 && c < headers.length - 1) {
        const dateObj = exportDates[c - 1];
        const day = dateObj.getDay();
        isWeekend = day === 0 || day === 6;
      }

      let isPackageHeader = false;
      if (c > 0 && c < headers.length - 1) {
        const headerText = headers[c];
        if (headerText && headerText.includes('包')) {
          isPackageHeader = true;
        }
      }

      ws[cellRef].s = {
        alignment: { wrapText: true, vertical: 'center', horizontal: 'center' },
        font: {
          ...(isWeekend && r === 0 ? { color: { rgb: 'EF4444' }, bold: true } : {}),
          ...(isRedFont ? { color: { rgb: 'EF4444' }, bold: true } : {})
        },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } }
        },
        ...((isPackageHeader && r === 0) ? {
          fill: { fgColor: { rgb: '86EFAC' } }
        } : (r > 0 && isNewcomer) ? {
          fill: { fgColor: { rgb: 'FFC0CB' } }
        } : isMarkedBlue ? {
          fill: { fgColor: { rgb: '93C5FD' } }
        } : {})
      };
    }
  }

  const maxCols = headers.length;
  const colWidths = Array(maxCols).fill({ wch: 10 });
  colWidths[0] = { wch: 15 };
  colWidths[maxCols - 1] = { wch: 12 };
  ws['!cols'] = colWidths;

  ws['!views'] = [
    {
      state: 'frozen',
      xSplit: 1,
      ySplit: 1,
      topLeftCell: 'B2',
      activePane: 'bottomRight'
    }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '排班網格表');

  const prefix = filenamePrefix ?? customPrefix ?? storeName ?? '';

  return {
    wb,
    filename: `${exportStartDate}_至_${exportEndDate}_${prefix}精品咖啡館排班網格表.xlsx`
  };
};

export const exportToExcel = (params: GenerateExcelParams): void => {
  const result = generateExcelWorkbook(params);
  if (result) {
    XLSX.writeFile(result.wb, result.filename);
  }
};
