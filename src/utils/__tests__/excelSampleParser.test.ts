import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import {
  parseComparisonSampleExcel,
  getStoredSampleSchedules,
  saveStoredSampleSchedules,
  clearStoredSampleSchedules
} from '../excelSampleParser';
import type { WorkSchedule } from '../../services/scheduler';

describe('excelSampleParser', () => {
  let mockStore: Record<string, string> = {};

  beforeAll(() => {
    const mockLocalStorage = {
      getItem: (key: string) => mockStore[key] || null,
      setItem: (key: string, value: string) => {
        mockStore[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStore[key];
      },
      clear: () => {
        mockStore = {};
      }
    };
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = mockLocalStorage;
  });

  beforeEach(() => {
    mockStore = {};
  });

  it('correctly parses an Excel file structured like the comparison schedule screenshot', () => {
    // Construct test sheet
    const data = [
      ['排班表 (2026-11 上半月 (1~15日)) - 門市出勤人員班表'],
      [
        '人員姓名',
        '身分',
        '1日\n(週日)',
        '2日\n(週一)',
        '3日\n(週二)',
        '4日\n(週三)',
        '5日\n(週四)',
        '總工時(h)'
      ],
      ['王昌薇 Wei(W)', '正職', '09:30-18:30', '09:30-18:30', '06:30-15:30', '06:30-15:30', '—', '36'],
      ['林汭怡 Lin', '正職', '—', '08:30-17:30', '09:30-18:30', '09:30-18:30', '09:30-18:30', '36'],
      ['王新嵐 Lena(A)', '兼職', '06:30-15:30', '06:30-12:00\n(月初寄資料)', '—', '—', '06:30-13:30', '21.5'],
      ['出勤人數 (人)', '', '2', '3', '2', '2', '2', ''],
      ['當日總工時 (h)', '合計', '16.0', '21.5', '16.0', '16.0', '15.0', '93.5'],
      ['營業無人時段', '空缺時段', '無', '無', '無', '無', '無', '0天 (全覆蓋)']
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '排班表');
    const arrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const result = parseComparisonSampleExcel(arrayBuffer, '2026-10');

    expect(result.extractedMonthStr).toBe('2026-11');
    expect(result.employeeCount).toBe(3);
    expect(result.schedules.length).toBeGreaterThan(0);

    // Verify Lena's shift on 2026-11-02 with notes
    const lenaShift = result.schedules.find(
      s => s.employeeName === '王新嵐 Lena(A)' && s.date === '2026-11-02'
    );
    expect(lenaShift).toBeDefined();
    expect(lenaShift?.startTime).toBe('06:30');
    expect(lenaShift?.endTime).toBe('12:00');
    expect(lenaShift?.notes).toBe('月初寄資料');

    // Verify summary rows were not parsed as employees
    const summaryEmp = result.schedules.find(s => s.employeeName.includes('出勤人數') || s.employeeName.includes('當日總工時'));
    expect(summaryEmp).toBeUndefined();
  });

  it('stores and retrieves sample schedules in localStorage without touching external DB', () => {
    const mockSample: WorkSchedule[] = [
      {
        id: 'sample-1',
        title: '王昌薇 Wei(W)',
        employeeName: '王昌薇 Wei(W)',
        date: '2026-11-01',
        workplace: '門市',
        startTime: '09:30',
        endTime: '18:30',
        color: '#3498db',
        createdAt: Date.now()
      },
      {
        id: 'sample-2',
        title: '林汭怡 Lin',
        employeeName: '林汭怡 Lin',
        date: '2026-12-01',
        workplace: '門市',
        startTime: '08:30',
        endTime: '17:30',
        color: '#e67e22',
        createdAt: Date.now()
      }
    ];

    saveStoredSampleSchedules(mockSample);
    const loaded = getStoredSampleSchedules();
    expect(loaded.length).toBe(2);
    expect(loaded[0].employeeName).toBe('王昌薇 Wei(W)');

    // Clear specific month
    clearStoredSampleSchedules('2026-11');
    const afterMonthClear = getStoredSampleSchedules();
    expect(afterMonthClear.length).toBe(1);
    expect(afterMonthClear[0].date).toBe('2026-12-01');

    // Clear all
    clearStoredSampleSchedules();
    const afterAllClear = getStoredSampleSchedules();
    expect(afterAllClear.length).toBe(0);
  });
});
