import { describe, it, expect } from 'vitest';
import { generatePureAutoSchedule, generateAutoSchedule } from '../autoScheduler';
import { calculateEffectiveWorkHours, isShiftActiveAtHour } from '../dateUtils';
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

    it('schedules 9-hour span for 8-hour work shift (including 1-hour break)', () => {
      const availabilities: WorkerAvailability[] = [
        {
          id: 'avail-1',
          employeeName: '張店長',
          date: '2026-10-01',
          workplace: '濟南店',
          startTime: '06:30',
          endTime: '16:00', // >= 9 hours available
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
      const [sh, sm] = shift.startTime.split(':').map(Number);
      const [eh, em] = shift.endTime.split(':').map(Number);
      const durationHours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
      expect(durationHours).toBe(9); // 9 hours span = 8h work + 1h break
    });

    it('schedules 4.5-hour span for 4-hour work shift (including 30-min break)', () => {
      const availabilities: WorkerAvailability[] = [
        {
          id: 'avail-pt',
          employeeName: '李夥伴',
          date: '2026-10-01',
          workplace: '濟南店',
          startTime: '08:30',
          endTime: '13:00', // 4.5 hours available
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
      const [sh, sm] = shift.startTime.split(':').map(Number);
      const [eh, em] = shift.endTime.split(':').map(Number);
      const durationHours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
      expect(durationHours).toBe(4.5); // 4.5 hours span = 4h work + 30m break
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

  describe('break rules and effective work hours (Rule 4 & Point 5)', () => {
    it('deducts 1 hour break for 9-hour span -> 8 hours work', () => {
      expect(calculateEffectiveWorkHours('06:30', '15:30')).toBe(8);
      expect(calculateEffectiveWorkHours('08:00', '17:00')).toBe(8);
    });

    it('deducts 30 mins break for 4.5-hour span -> 4 hours work', () => {
      expect(calculateEffectiveWorkHours('08:30', '13:00')).toBe(4);
    });

    it('deducts 30 mins break for intermediate shifts between 4h and 8.5h', () => {
      expect(calculateEffectiveWorkHours('08:30', '15:30')).toBe(6.5); // 7h - 0.5h
      expect(calculateEffectiveWorkHours('08:30', '12:30')).toBe(3.5); // 4h - 0.5h
    });

    it('correctly evaluates 08:30-12:30 shift: active in 11:30-12:30, NOT active in 12:30-13:30', () => {
      // hour 11 corresponds to slot 11:30 - 12:30
      expect(isShiftActiveAtHour('08:30', '12:30', 11)).toBe(true);
      // hour 12 corresponds to slot 12:30 - 13:30 (張以恩 is off work, overlap is 0)
      expect(isShiftActiveAtHour('08:30', '12:30', 12)).toBe(false);
    });
  });

  describe('new preferences: FT 5-day overtime avoidance and 2-3 consecutive days', () => {
    it('prefers PT over FT on 6th day of the week to avoid paying overtime for full-time workers', () => {
      // 張店長 is FT, already worked 5 days this week (2026-10-05 to 2026-10-09, Mon to Fri)
      const existingSchedules: WorkSchedule[] = [
        { id: 's-1', title: '張店長', employeeName: '張店長', date: '2026-10-05', startTime: '06:30', endTime: '15:30', workplace: '濟南店', color: 'blue', createdAt: 1 },
        { id: 's-2', title: '張店長', employeeName: '張店長', date: '2026-10-06', startTime: '06:30', endTime: '15:30', workplace: '濟南店', color: 'blue', createdAt: 2 },
        { id: 's-3', title: '張店長', employeeName: '張店長', date: '2026-10-07', startTime: '06:30', endTime: '15:30', workplace: '濟南店', color: 'blue', createdAt: 3 },
        { id: 's-4', title: '張店長', employeeName: '張店長', date: '2026-10-08', startTime: '06:30', endTime: '15:30', workplace: '濟南店', color: 'blue', createdAt: 4 },
        { id: 's-5', title: '張店長', employeeName: '張店長', date: '2026-10-09', startTime: '06:30', endTime: '15:30', workplace: '濟南店', color: 'blue', createdAt: 5 }
      ];

      // On Saturday 2026-10-10, both 張店長 (FT, 5 days already) and 李夥伴 (PT, 0 days) are available
      const availabilities: WorkerAvailability[] = [
        {
          id: 'avail-sat-ft',
          employeeName: '張店長',
          date: '2026-10-10',
          workplace: '濟南店',
          startTime: '06:30',
          endTime: '15:30',
          createdAt: 10
        },
        {
          id: 'avail-sat-pt',
          employeeName: '李夥伴',
          date: '2026-10-10',
          workplace: '濟南店',
          startTime: '06:30',
          endTime: '15:30',
          createdAt: 11
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
          dateRange: ['2026-10-10'],
          prioritizeFullTime: true,
          maxHoursPerShift: 8,
          onlyFillDeficits: true,
          operatingStartTime: '06:30',
          operatingEndTime: '18:00',
          staffingDemandConfig: {
            ...defaultDemandConfig,
            openingStaffCount: 1,
            weekdayMaxStaff: 1,
            weekendMaxStaff: 1
          }
        }
      );

      // 李夥伴 (PT) should be picked instead of assigning 張店長 a 6th overtime day!
      expect(result.proposedSchedules.length).toBe(1);
      expect(result.proposedSchedules[0].employeeName).toBe('李夥伴');
    });

    it('prefers candidate with 1-2 consecutive days over candidate with 3 consecutive days to split holidays', () => {
      // 李夥伴 worked 3 days in a row (2026-10-05, 10-06, 10-07)
      // 王夥伴 worked 1 day (2026-10-07)
      const existingSchedules: WorkSchedule[] = [
        { id: 's-1', title: '李夥伴', employeeName: '李夥伴', date: '2026-10-05', startTime: '06:30', endTime: '15:30', workplace: '濟南店', color: 'blue', createdAt: 1 },
        { id: 's-2', title: '李夥伴', employeeName: '李夥伴', date: '2026-10-06', startTime: '06:30', endTime: '15:30', workplace: '濟南店', color: 'blue', createdAt: 2 },
        { id: 's-3', title: '李夥伴', employeeName: '李夥伴', date: '2026-10-07', startTime: '06:30', endTime: '15:30', workplace: '濟南店', color: 'blue', createdAt: 3 },
        { id: 's-4', title: '王夥伴', employeeName: '王夥伴', date: '2026-10-07', startTime: '06:30', endTime: '15:30', workplace: '濟南店', color: 'green', createdAt: 4 }
      ];

      // On Thursday 2026-10-08, both are available.
      // Scheduling 李夥伴 would make it 4 consecutive days (violates 2-3 consecutive days preference).
      // Scheduling 王夥伴 makes it 2 consecutive days (in the ideal 2-3 sweet spot!).
      const availabilities: WorkerAvailability[] = [
        {
          id: 'avail-thu-1',
          employeeName: '李夥伴',
          date: '2026-10-08',
          workplace: '濟南店',
          startTime: '06:30',
          endTime: '15:30',
          createdAt: 10
        },
        {
          id: 'avail-thu-2',
          employeeName: '王夥伴',
          date: '2026-10-08',
          workplace: '濟南店',
          startTime: '06:30',
          endTime: '15:30',
          createdAt: 11
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
          dateRange: ['2026-10-08'],
          prioritizeFullTime: true,
          maxHoursPerShift: 8,
          onlyFillDeficits: true,
          operatingStartTime: '06:30',
          operatingEndTime: '18:00',
          staffingDemandConfig: {
            ...defaultDemandConfig,
            openingStaffCount: 1,
            weekdayMaxStaff: 1,
            weekendMaxStaff: 1
          }
        }
      );

      expect(result.proposedSchedules.length).toBe(1);
      expect(result.proposedSchedules[0].employeeName).toBe('王夥伴');
    });

    it('strictly enforces the 20-hour weekly cap for overseas students (僑生兼職)', () => {
      const employeesWithOverseas: Employee[] = [
        ...mockEmployees,
        {
          id: 'emp-overseas',
          name: '陳僑生',
          phone: '0955667788',
          status: '兼職夥伴',
          isOverseasStudent: true,
          active: true,
          trainedPositions: ['開早', '餐吧'],
          createdAt: 4000
        }
      ];

      // 陳僑生 already worked 16 effective hours in the week (Mon 8h + Tue 8h)
      const existingSchedules: WorkSchedule[] = [
        { id: 'os-1', title: '陳僑生', employeeName: '陳僑生', date: '2026-10-05', startTime: '06:30', endTime: '15:30', workplace: '濟南店', color: 'amber', createdAt: 1 },
        { id: 'os-2', title: '陳僑生', employeeName: '陳僑生', date: '2026-10-06', startTime: '06:30', endTime: '15:30', workplace: '濟南店', color: 'amber', createdAt: 2 }
      ];

      // On Wed 2026-10-07 ( permits at most 4h more work to stay <= 20h) and Thu 2026-10-08 (should be blocked once at 20h)
      const availabilities: WorkerAvailability[] = [
        {
          id: 'avail-os-wed',
          employeeName: '陳僑生',
          date: '2026-10-07',
          workplace: '濟南店',
          startTime: '06:30',
          endTime: '15:30',
          createdAt: 10
        },
        {
          id: 'avail-os-thu',
          employeeName: '陳僑生',
          date: '2026-10-08',
          workplace: '濟南店',
          startTime: '06:30',
          endTime: '15:30',
          createdAt: 11
        }
      ];

      const result = generateAutoSchedule(
        availabilities,
        existingSchedules,
        employeesWithOverseas,
        [],
        [],
        [],
        {
          dateRange: ['2026-10-07', '2026-10-08'],
          prioritizeFullTime: true,
          maxHoursPerShift: 8,
          onlyFillDeficits: true,
          operatingStartTime: '06:30',
          operatingEndTime: '18:00',
          staffingDemandConfig: defaultDemandConfig
        }
      );

      // Should only be scheduled on Wed for 4.5h span (4h effective work) -> 16 + 4 = 20h total
      // And blocked on Thu because 20h weekly cap is reached!
      expect(result.proposedSchedules.length).toBe(1);
      expect(result.proposedSchedules[0].date).toBe('2026-10-07');
      expect(calculateEffectiveWorkHours(result.proposedSchedules[0].startTime, result.proposedSchedules[0].endTime)).toBe(4);
    });

    it('strictly caps consecutive working days at 4 days (never 5 or 6 consecutive days) and FT at 5 days/week', () => {
      // 7-day week from Mon 2026-10-05 to Sun 2026-10-11
      const dateRange = [
        '2026-10-05',
        '2026-10-06',
        '2026-10-07',
        '2026-10-08',
        '2026-10-09',
        '2026-10-10',
        '2026-10-11'
      ];

      // Even if a full-time employee (張店長) and part-time employee (李夥伴) submit availability for all 7 days
      const availabilities: WorkerAvailability[] = [];
      dateRange.forEach((date, idx) => {
        availabilities.push({
          id: `ft-${idx}`,
          employeeName: '張店長',
          date,
          workplace: '濟南店',
          startTime: '06:30',
          endTime: '18:30',
          createdAt: 100 + idx
        });
        availabilities.push({
          id: `pt-${idx}`,
          employeeName: '李夥伴',
          date,
          workplace: '濟南店',
          startTime: '06:30',
          endTime: '18:30',
          createdAt: 200 + idx
        });
      });

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

      for (const empName of ['張店長', '李夥伴']) {
        const empDates = result.proposedSchedules
          .filter(s => s.employeeName === empName)
          .map(s => s.date)
          .sort();

        // FT should work at most 5 days in the Mon-Sun week
        if (empName === '張店長') {
          expect(empDates.length).toBeLessThanOrEqual(5);
        }

        // Check max consecutive working days <= 4
        let maxStreak = empDates.length > 0 ? 1 : 0;
        let currentStreak = empDates.length > 0 ? 1 : 0;
        for (let i = 1; i < empDates.length; i++) {
          const prev = new Date(empDates[i - 1] + 'T00:00:00');
          const curr = new Date(empDates[i] + 'T00:00:00');
          const diff = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
          if (diff === 1) {
            currentStreak++;
            if (currentStreak > maxStreak) maxStreak = currentStreak;
          } else {
            currentStreak = 1;
          }
        }
        expect(maxStreak).toBeLessThanOrEqual(4);
      }
    });

    it('strictly caps shifts at store closing time (e.g. 16:30 on Sunday) and prefers PT over FT when operating hours < 9h', () => {
      // Sunday 2026-10-04 with 09:30 - 16:30 weekend hours (7 hours total, < 9h)
      // Both FT (張店長) and PT (李夥伴, 王夥伴) submit availability up to 18:30
      const availabilities: WorkerAvailability[] = [
        {
          id: 'sun-ft',
          employeeName: '張店長',
          date: '2026-10-04',
          workplace: '濟南店',
          startTime: '09:30',
          endTime: '18:30',
          createdAt: 1
        },
        {
          id: 'sun-pt1',
          employeeName: '李夥伴',
          date: '2026-10-04',
          workplace: '濟南店',
          startTime: '09:30',
          endTime: '18:30',
          createdAt: 2
        },
        {
          id: 'sun-pt2',
          employeeName: '王夥伴',
          date: '2026-10-04',
          workplace: '濟南店',
          startTime: '09:30',
          endTime: '18:30',
          createdAt: 3
        }
      ];

      const shortWeekendConfig = {
        ...defaultDemandConfig,
        operatingStartTimeWeekend: '09:30',
        operatingEndTimeWeekend: '16:30',
        weekendMaxStaff: 2
      };

      const result = generatePureAutoSchedule(
        availabilities,
        mockEmployees,
        [],
        {
          dateRange: ['2026-10-04'],
          operatingStartTime: '07:30',
          operatingEndTime: '18:30',
          staffingDemandConfig: shortWeekendConfig
        }
      );

      // Every shift must end on or before 16:30 (never 18:30)
      for (const s of result.proposedSchedules) {
        expect(s.endTime <= '16:30').toBe(true);
        expect(s.startTime >= '09:30').toBe(true);
      }

      // PT workers should be scheduled first, saving FT (張店長) for 9h weekday shifts
      const scheduledNames = result.proposedSchedules.map(s => s.employeeName);
      expect(scheduledNames).toContain('李夥伴');
      expect(scheduledNames).toContain('王夥伴');
      expect(scheduledNames).not.toContain('張店長');

      // Fallback check: if only FT (張店長) is available on that Sunday, FT is used and capped at 16:30
      const fallbackResult = generatePureAutoSchedule(
        [availabilities[0]],
        mockEmployees,
        [],
        {
          dateRange: ['2026-10-04'],
          operatingStartTime: '07:30',
          operatingEndTime: '18:30',
          staffingDemandConfig: shortWeekendConfig
        }
      );
      expect(fallbackResult.proposedSchedules.length).toBe(1);
      expect(fallbackResult.proposedSchedules[0].employeeName).toBe('張店長');
      expect(fallbackResult.proposedSchedules[0].startTime).toBe('09:30');
      expect(fallbackResult.proposedSchedules[0].endTime).toBe('16:30');
    });
  });
});
