import * as XLSX from 'xlsx-js-style';
import JSZip from 'jszip';
import type { WorkSchedule, WorkerAvailability, Employee } from '../services/scheduler';
import { DAYS_OF_WEEK, ALL_POSITIONS } from './constants';
import { formatDateString, getDatesInRange, calculateDuration, getCleanNote, getManagerNote, compareTimeStrings } from './dateUtils';

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
        const workerNote = (sched.workerNotes !== undefined && sched.workerNotes !== '')
          ? sched.workerNotes.trim()
          : getCleanNote(sched.notes);
        const managerNote = getManagerNote(sched);
        const combinedNotes = [managerNote, workerNote].filter(Boolean).join('; ');
        return combinedNotes
          ? `${sched.startTime}-${sched.endTime}\n(${combinedNotes})`
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
  ws['!freeze'] = {
    state: 'frozen',
    xSplit: 1,
    ySplit: 1,
    topLeftCell: 'B2',
    activePane: 'bottomRight'
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '排班網格表');

  const prefix = filenamePrefix ?? customPrefix ?? storeName ?? '';

  return {
    wb,
    filename: `${exportStartDate}_至_${exportEndDate}_${prefix}精品咖啡館排班網格表.xlsx`
  };
};

export const generateExcelBuffer = async (
  wb: XLSX.WorkBook,
  xSplit: number = 1,
  ySplit: number = 1
): Promise<Uint8Array> => {
  const rawBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  try {
    const zip = await JSZip.loadAsync(rawBuffer);
    const sheetFiles = Object.keys(zip.files).filter(name => name.startsWith('xl/worksheets/sheet'));
    const paneXml = `<pane xSplit="${xSplit}" ySplit="${ySplit}" topLeftCell="B2" activePane="bottomRight" state="frozen"/>`;

    for (const filename of sheetFiles) {
      const zipFile = zip.file(filename);
      if (!zipFile) continue;
      let xml = await zipFile.async('text');
      if (xml.includes('<sheetView workbookViewId="0"/>')) {
        xml = xml.replace('<sheetView workbookViewId="0"/>', `<sheetView workbookViewId="0">${paneXml}</sheetView>`);
      } else if (xml.includes('<sheetView workbookViewId="0">')) {
        xml = xml.replace('<sheetView workbookViewId="0">', `<sheetView workbookViewId="0">${paneXml}`);
      } else if (xml.includes('<sheetViews>')) {
        xml = xml.replace('<sheetViews>', `<sheetViews><sheetView workbookViewId="0">${paneXml}</sheetView>`);
      }
      zip.file(filename, xml);
    }
    return await zip.generateAsync({ type: 'uint8array' });
  } catch (error) {
    console.error('Failed to inject freeze pane XML into XLSX zip:', error);
    return new Uint8Array(rawBuffer);
  }
};

export const exportToExcel = async (params: GenerateExcelParams): Promise<void> => {
  const result = generateExcelWorkbook(params);
  if (result) {
    const buffer = await generateExcelBuffer(result.wb, 1, 1);
    const blob = new Blob([buffer.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};

export const exportEmployeesToExcel = async (
  employees: Employee[],
  filterDescription?: string
): Promise<void> => {
  if (!employees || employees.length === 0) {
    alert('尚無員工資料可供匯出。');
    return;
  }

  const wb = XLSX.utils.book_new();

  const titleRow = [
    { v: '埔里酒廠門市 - 員工名單與在職狀態總表', t: 's', s: { font: { bold: true, sz: 14, color: { rgb: '3E2723' } } } }
  ];

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const subTitleRow = [
    { v: `匯出時間: ${dateStr}${filterDescription ? ` | 篩選條件: ${filterDescription}` : ''} | 總計: ${employees.length} 位夥伴`, t: 's', s: { font: { sz: 10, italic: true, color: { rgb: '6D4C41' } } } }
  ];

  const headers = [
    '序號',
    '姓名',
    '在職狀態',
    '身分',
    '新進人員',
    '聯絡電話',
    '正在培訓崗位',
    '已受訓合格崗位',
    '合格進度',
    '持有證照',
    '建立日期'
  ];

  const headerRow = headers.map(h => ({
    v: h,
    t: 's',
    s: {
      fill: { fgColor: { rgb: '795548' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: 'DAC0A3' } },
        bottom: { style: 'medium', color: { rgb: '3E2723' } },
        left: { style: 'thin', color: { rgb: 'DAC0A3' } },
        right: { style: 'thin', color: { rgb: 'DAC0A3' } }
      }
    }
  }));

  const dataRows = employees.map((emp, index) => {
    const isActive = emp.active !== false;
    const isNewcomer = !!emp.isNewcomer;
    const trainedCount = emp.trainedPositions ? emp.trainedPositions.length : 0;
    const trainedStr = emp.trainedPositions && emp.trainedPositions.length > 0
      ? emp.trainedPositions.join('、')
      : '無';
    const certsStr = emp.certificates && emp.certificates.length > 0
      ? emp.certificates.join('、')
      : '無';
    const createdDateStr = emp.createdAt ? new Date(emp.createdAt).toLocaleDateString('zh-TW') : '-';
    const isEven = index % 2 === 1;
    const rowBg = isEven ? 'FAF7F2' : 'FFFFFF';

    const cellBaseStyle = {
      fill: { fgColor: { rgb: rowBg } },
      font: { sz: 10, color: { rgb: isActive ? '3E2723' : '8D6E63' } },
      alignment: { vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: 'EADBC8' } },
        bottom: { style: 'thin', color: { rgb: 'EADBC8' } },
        left: { style: 'thin', color: { rgb: 'EADBC8' } },
        right: { style: 'thin', color: { rgb: 'EADBC8' } }
      }
    };

    return [
      { v: index + 1, t: 'n', s: { ...cellBaseStyle, alignment: { horizontal: 'center', vertical: 'center' } } },
      { v: emp.name, t: 's', s: { ...cellBaseStyle, font: { ...cellBaseStyle.font, bold: true } } },
      {
        v: isActive ? '在職' : '離職',
        t: 's',
        s: {
          ...cellBaseStyle,
          font: { ...cellBaseStyle.font, bold: true, color: { rgb: isActive ? '2E7D32' : 'C62828' } },
          alignment: { horizontal: 'center', vertical: 'center' }
        }
      },
      {
        v: emp.status,
        t: 's',
        s: {
          ...cellBaseStyle,
          font: { ...cellBaseStyle.font, bold: true, color: { rgb: emp.status === '正式夥伴' ? '1565C0' : '6A1B9A' } },
          alignment: { horizontal: 'center', vertical: 'center' }
        }
      },
      {
        v: isNewcomer ? '是' : '否',
        t: 's',
        s: {
          ...cellBaseStyle,
          font: { ...cellBaseStyle.font, color: { rgb: isNewcomer ? 'E91E63' : '8D6E63' }, bold: isNewcomer },
          alignment: { horizontal: 'center', vertical: 'center' }
        }
      },
      { v: emp.phone || '無', t: 's', s: { ...cellBaseStyle, alignment: { horizontal: 'center', vertical: 'center' } } },
      { v: emp.trainingPosition || '無', t: 's', s: { ...cellBaseStyle, alignment: { horizontal: 'center', vertical: 'center' } } },
      { v: trainedStr, t: 's', s: { ...cellBaseStyle, alignment: { horizontal: 'left', vertical: 'center' } } },
      {
        v: `${trainedCount}/${ALL_POSITIONS.length} (${Math.round((trainedCount / ALL_POSITIONS.length) * 100)}%)`,
        t: 's',
        s: { ...cellBaseStyle, alignment: { horizontal: 'center', vertical: 'center' } }
      },
      { v: certsStr, t: 's', s: { ...cellBaseStyle, alignment: { horizontal: 'left', vertical: 'center' } } },
      { v: createdDateStr, t: 's', s: { ...cellBaseStyle, alignment: { horizontal: 'center', vertical: 'center' } } }
    ];
  });

  const wsData = [
    titleRow,
    subTitleRow,
    [],
    headerRow,
    ...dataRows
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 15 },
    { wch: 14 },
    { wch: 24 },
    { wch: 14 },
    { wch: 18 },
    { wch: 14 }
  ];

  ws['!rows'] = [
    { hpt: 26 },
    { hpt: 18 },
    { hpt: 8 },
    { hpt: 24 },
    ...employees.map(() => ({ hpt: 22 }))
  ];

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } }
  ];

  XLSX.utils.book_append_sheet(wb, ws, '員工名單與狀態');

  const rawBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  let finalBuffer: Uint8Array = new Uint8Array(rawBuffer);

  try {
    const zip = await JSZip.loadAsync(rawBuffer);
    const sheetFiles = Object.keys(zip.files).filter(name => name.startsWith('xl/worksheets/sheet'));
    const paneXml = `<pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/>`;

    for (const filename of sheetFiles) {
      const zipFile = zip.file(filename);
      if (!zipFile) continue;
      let xml = await zipFile.async('text');
      if (xml.includes('<sheetView workbookViewId="0"/>')) {
        xml = xml.replace('<sheetView workbookViewId="0"/>', `<sheetView workbookViewId="0">${paneXml}</sheetView>`);
      } else if (xml.includes('<sheetView workbookViewId="0">')) {
        xml = xml.replace('<sheetView workbookViewId="0">', `<sheetView workbookViewId="0">${paneXml}`);
      } else if (xml.includes('<sheetViews>')) {
        xml = xml.replace('<sheetViews>', `<sheetViews><sheetView workbookViewId="0">${paneXml}</sheetView>`);
      }
      zip.file(filename, xml);
    }
    finalBuffer = await zip.generateAsync({ type: 'uint8array' });
  } catch (err) {
    console.error('Failed to inject freeze pane in employee export:', err);
  }

  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const filename = `員工名單與狀態表_${ymd}.xlsx`;

  const blob = new Blob([finalBuffer.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

