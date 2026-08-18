import * as XLSX from 'xlsx-js-style';

export interface G031ParsedData {
  reportCode: string;
  reportTitle: string;
  storeName: string;
  dateRangeStr: string;
  startDate?: string;
  endDate?: string;
  totalDays: number;
  estimatedMonths: number;
  totalAmount: number;
  hourlyAmounts: Record<number, number>; // Hour (0-23) -> Raw total amount from G031 report
}

export function parseG031Excel(arrayBuffer: ArrayBuffer): G031ParsedData {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Excel 檔案內未找到任何工作表。');
  }

  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (!rows || rows.length < 5) {
    throw new Error('檔案內容行數不足，請確認是否為標準 G031 時段營業資料分析表。');
  }

  let reportCode = 'VENUSTW_G031';
  let reportTitle = '時段營業資料統計表-門市明細';
  let storeName = '';
  let dateRangeStr = '';
  let startDateStr = '';
  let endDateStr = '';

  // Scan metadata rows (rows 0 to 5)
  for (let r = 0; r < Math.min(rows.length, 6); r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c]).trim();
      if (cell.includes('G031') || cell.includes('VENUSTW')) {
        reportCode = cell;
      }
      if (cell.includes('時段營業資料')) {
        reportTitle = cell.replace(/[☆★]/g, '').trim();
      }
      if (cell.startsWith('門市：') || cell.startsWith('門市:')) {
        storeName = cell.replace(/門市[：:]/, '').trim();
      } else if (cell === '門市' || cell === '門市：' || cell === '門市:') {
        if (row[c + 1]) storeName = String(row[c + 1]).trim();
      }

      if (cell.startsWith('區間：') || cell.startsWith('區間:')) {
        dateRangeStr = cell.replace(/區間[：:]/, '').trim();
      } else if (cell === '區間' || cell === '區間：' || cell === '區間:') {
        if (row[c + 1]) dateRangeStr = String(row[c + 1]).trim();
      } else if (/\d{4}[\/\-]\d{2}[\/\-]\d{2}\s*~\s*\d{4}[\/\-]\d{2}[\/\-]\d{2}/.test(cell)) {
        dateRangeStr = cell;
      }
    }
  }

  // Calculate days and months from dateRangeStr (e.g. 2026/01/01~2026/07/31)
  let totalDays = 30;
  let estimatedMonths = 1;
  const rangeMatch = dateRangeStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s*~\s*(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (rangeMatch) {
    const startYear = parseInt(rangeMatch[1], 10);
    const startMonth = parseInt(rangeMatch[2], 10);
    const startDay = parseInt(rangeMatch[3], 10);
    const endYear = parseInt(rangeMatch[4], 10);
    const endMonth = parseInt(rangeMatch[5], 10);
    const endDay = parseInt(rangeMatch[6], 10);

    startDateStr = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    endDateStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

    const d1 = new Date(startYear, startMonth - 1, startDay);
    const d2 = new Date(endYear, endMonth - 1, endDay);
    const diffTime = d2.getTime() - d1.getTime();
    if (diffTime >= 0) {
      totalDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
      const monthDiff = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
      if (startDay === 1 && endDay >= 28) {
        estimatedMonths = Math.max(1, monthDiff);
      } else {
        estimatedMonths = Math.max(1, Math.round((totalDays / 30.4375) * 10) / 10);
      }
    }
  }

  // Find table header row
  let headerRowIndex = -1;
  let periodColIndex = 0;
  let amountColIndex = 1;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c]).trim();
      if (cell === '時段') {
        headerRowIndex = r;
        periodColIndex = c;
      }
      if (cell.includes('營業金額') || cell.includes('金額')) {
        amountColIndex = c;
      }
    }
    if (headerRowIndex !== -1) break;
  }

  if (headerRowIndex === -1) {
    headerRowIndex = 4; // Fallback standard G031 header at row index 4
  }

  const hourlyAmounts: Record<number, number> = {};
  let totalAmount = 0;

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const periodCell = String(row[periodColIndex] ?? '').trim();
    const amountCell = row[amountColIndex];

    if (periodCell === '合計' || periodCell === '總計' || periodCell.includes('合計')) {
      const rawTotal = typeof amountCell === 'number'
        ? amountCell
        : parseFloat(String(amountCell).replace(/,/g, '')) || 0;
      totalAmount = rawTotal;
      continue;
    }

    // Match period format: "00-01", "06-07", "06:00-07:00", "6-7"
    const match = periodCell.match(/^(\d{1,2})\s*[-~:]\s*(\d{1,2})/);
    if (match) {
      const startHour = parseInt(match[1], 10);
      if (startHour >= 0 && startHour <= 23) {
        const rawAmount = typeof amountCell === 'number'
          ? amountCell
          : parseFloat(String(amountCell).replace(/,/g, '')) || 0;

        hourlyAmounts[startHour] = rawAmount;
      }
    }
  }

  if (totalAmount === 0) {
    totalAmount = Object.values(hourlyAmounts).reduce((sum, v) => sum + v, 0);
  }

  return {
    reportCode,
    reportTitle,
    storeName,
    dateRangeStr,
    startDate: startDateStr,
    endDate: endDateStr,
    totalDays,
    estimatedMonths,
    totalAmount,
    hourlyAmounts
  };
}
