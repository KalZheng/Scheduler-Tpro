import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import { parseG031Excel } from '../g031Parser';

describe('g031Parser', () => {
  function createMockG031Workbook(options?: {
    storeName?: string;
    dateRange?: string;
    hourlyData?: { period: string; amount: number }[];
    totalAmount?: number;
  }): ArrayBuffer {
    const store = options?.storeName ?? '濟南門市';
    const range = options?.dateRange ?? '2026/01/01 ~ 2026/01/31';
    const hourly = options?.hourlyData ?? [
      { period: '07-08', amount: 1500 },
      { period: '08-09', amount: 2800 },
      { period: '11-12', amount: 5600 },
      { period: '12-13', amount: 6200 },
      { period: '17-18', amount: 3100 }
    ];
    const total = options?.totalAmount ?? hourly.reduce((sum, h) => sum + h.amount, 0);

    const rows: any[][] = [
      ['報表代號：VENUSTW_G031', '', '時段營業資料統計表-門市明細', ''],
      [`門市：${store}`, '', `區間：${range}`, ''],
      ['', '', '', ''],
      ['', '', '', ''],
      ['時段', '來客數', '營業金額', '佔比%']
    ];

    hourly.forEach(item => {
      rows.push([item.period, 20, item.amount, '10.0%']);
    });

    rows.push(['合計', 100, total, '100.0%']);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'G031');
    const u8 = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
  }

  it('correctly parses store name, date range, total days and estimated months', () => {
    const buffer = createMockG031Workbook({
      storeName: '濟南門市',
      dateRange: '2026/01/01 ~ 2026/01/31'
    });

    const result = parseG031Excel(buffer);
    expect(result.storeName).toBe('濟南門市');
    expect(result.dateRangeStr).toContain('2026/01/01 ~ 2026/01/31');
    expect(result.startDate).toBe('2026-01-01');
    expect(result.endDate).toBe('2026-01-31');
    expect(result.totalDays).toBe(31);
    expect(result.estimatedMonths).toBe(1);
  });

  it('correctly extracts hourly amounts and total revenue', () => {
    const buffer = createMockG031Workbook({
      hourlyData: [
        { period: '07-08', amount: 1500 },
        { period: '12-13', amount: 6200 }
      ],
      totalAmount: 7700
    });

    const result = parseG031Excel(buffer);
    expect(result.hourlyAmounts[7]).toBe(1500);
    expect(result.hourlyAmounts[12]).toBe(6200);
    expect(result.totalAmount).toBe(7700);
  });

  it('throws an error if file is empty or missing sheets', () => {
    expect(() => {
      parseG031Excel(new ArrayBuffer(0));
    }).toThrow();
  });
});
