import { describe, it, expect } from 'vitest';
import { generatePureAutoSchedule, generateAutoSchedule } from '../autoScheduler';
import type { Employee, WorkerAvailability, WorkSchedule } from '../../services/scheduler';

describe('autoScheduler', () => {
  const mockEmployees: Employee[] = [
    {
      id: 'emp-1',
      name: '張店長',
      phone: '0912345678',
      status: '正式夥伴',
      active: true,
      trainedPositions: ['開早', '收班', '餐吧', 'POS機', '後吧'],
      createdAt: 1000
    },
    {
      id: 'emp-2',
      name: '李夥伴',
      phone: '0922334455',
      status: '兼職夥伴',
      active: true,
      trainedPositions: ['開早', '餐吧'],
      createdAt: 2000
    },
    {
      id: 'emp-3',
      name: '王夥伴',
      phone: '0933445566',
      status: '兼職夥伴',
      active: true,
      trainedPositions: ['收班', '後吧'],
      createdAt: 3000
    }
  ];

  const defaultDemandConfig = {
    operatingStartTimeWeekend: '06:30',
    operatingEndTimeWeekend: '18:30',
    weekdayMaxStaff: 2,
    weekendMaxStaff: 3,
    openingStaffCount: 1,
    closingStaffCount: 1,
    peakStartTime: '11:30',
    peakEndTime: '13:30'
  };

  describe('generatePureAutoSchedule', () => {
    it('schedules opening shift covering opening window (06:30)', () => {
      const availabilities: WorkerAvailability[] = [
        {
          id: 'avail-1',
          employeeName: '李夥伴',
          date: '2026-10-01', // Thursday (weekday)
          workplace: '濟南店',
          startTime: '06:30',
          endTime: '15:30',
          createdAt: 1000
        }
      ];

      const result = generatePureAutoSchedule(
        availabilities,
        mockEmployees,
        [],
        {
          dateRange: ['2026-10-01'],
          operatingStartTime: '06:30',
          operatingEndTime: '18:00',
          staffingDemandConfig: defaultDemandConfig
        }
      );

      expect(result.proposedSchedules.length).toBeGreaterThanOrEqual(1);
      const shift = result.proposedSchedules[0];
      expect(shift.employeeName).toBe('李夥伴');
      expect(shift.startTime).toBe('06:30');
    });

    it('ensures all assigned shift durations are full integer hours', () => {
      const availabilities: WorkerAvailability[] = [
        {
          id: 'avail-1',
          employeeName: '李夥伴',
          date: '2026-10-01',
          workplace: '濟南店',
          startTime: '06:30',
          endTime: '15:00', // 8.5 hours
          createdAt: 1000
        }
      ];

      const result = generatePureAutoSchedule(
        availabilities,
        mockEmployees,
        [],
        {
          dateRange: ['2026-10-01'],
          operatingStartTime: '06:30',
          operatingEndTime: '18:00',
          staffingDemandConfig: defaultDemandConfig
        }
      );

      result.proposedSchedules.forEach(schedule => {
        const [sh, sm] = schedule.startTime.split(':').map(Number);
        const [eh, em] = schedule.endTime.split(':').map(Number);
        const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
        expect(durationMinutes % 60).toBe(0); // Must be full integer hours
      });
    });

    it('prevents scheduling 7 consecutive work days for an employee', () => {
      // 7 days in a row: 2026-10-01 to 2026-10-07
      const dateRange = [
        '2026-10-01',
        '2026-10-02',
        '2026-10-03',
        '2026-10-04',
        '2026-10-05',
        '2026-10-06',
        '2026-10-07'
      ];

      const availabilities: WorkerAvailability[] = dateRange.map((date, idx) => ({
        id: `avail-${idx + 1}`,
        employeeName: '李夥伴',
        date,
        workplace: '濟南店',
        startTime: '06:30',
        endTime: '14:30',
        createdAt: 1000 + idx
      }));

      const result = generatePureAutoSchedule(
        availabilities,
        mockEmployees,
        [],
        {
          dateRange,
          operatingStartTime: '06:30',
          operatingEndTime: '18:00',
          staffingDemandConfig: defaultDemandConfig
        }
      );

      // Should schedule at most 6 days, not 7 consecutive days
      const empSchedules = result.proposedSchedules.filter(s => s.employeeName === '李夥伴');
      expect(empSchedules.length).toBeLessThanOrEqual(6);
    });
  });

  describe('generateAutoSchedule (incremental)', () => {
    it('respects existing schedules and fills remaining deficits', () => {
      const existingSchedules: WorkSchedule[] = [
        {
          id: 'sched-1',
          title: '已排早班',
          employeeName: '張店長',
          date: '2026-10-01',
          workplace: '濟南店',
          startTime: '06:30',
          endTime: '14:30',
          color: 'emerald',
          createdAt: 500
        }
      ];

      const availabilities: WorkerAvailability[] = [
        {
          id: 'avail-2',
          employeeName: '王夥伴',
          date: '2026-10-01',
          workplace: '濟南店',
          startTime: '10:00',
          endTime: '18:00',
          createdAt: 1000
        }
      ];

      const result = generateAutoSchedule(
        availabilities,
        existingSchedules,
        mockEmployees,
        [],
        [],
        [],
        {
          dateRange: ['2026-10-01'],
          prioritizeFullTime: true,
          maxHoursPerShift: 8,
          onlyFillDeficits: true,
          operatingStartTime: '06:30',
          operatingEndTime: '18:00',
          staffingDemandConfig: defaultDemandConfig
        }
      );

      expect(result.proposedSchedules.length).toBeGreaterThanOrEqual(1);
      expect(result.proposedSchedules[0].employeeName).toBe('王夥伴');
    });
  });
});
