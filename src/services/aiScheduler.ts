import type { WorkSchedule, WorkerAvailability, Employee, StaffingTarget, StaffingDemandConfig } from './scheduler';
import { hasSevenConsecutiveDays, isShiftActiveAtHour } from '../utils/dateUtils';

export interface ProposedAISchedule {
  availabilityId: string;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
  workplace: string;
  notes: string;
  workerNotes?: string;
  managerNotes?: string;
  color?: string;
  scheduleSource?: 'manual' | 'rule' | 'ai' | 'instant';
  shiftType?: string;
  reasoning?: string;
}

export interface RunAIScheduleOptions {
  apiKey?: string;
  modelName?: string;
  dateRange: string[];
  availabilities: WorkerAvailability[];
  schedules: WorkSchedule[];
  employees: Employee[];
  staffingTargets: StaffingTarget[];
  onlyFillDeficits?: boolean;
  operatingStartTime?: string;
  operatingEndTime?: string;
  staffingDemandConfig?: StaffingDemandConfig;
}

function addMinutesToTimeStr(t: string, mins: number): string {
  const [h, m] = (t || '00:00').split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  let total = (h * 60 + m + mins + 1440) % 1440;
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

export function buildAIPromptPayload(options: RunAIScheduleOptions) {
  const activeEmployees = options.employees.filter(e => e.active !== false);

  const opStartWk = options.operatingStartTime || '06:30';
  const opEndWk = options.operatingEndTime || '18:00';
  const opStartWknd = options.staffingDemandConfig?.operatingStartTimeWeekend || '06:30';
  const opEndWknd = options.staffingDemandConfig?.operatingEndTimeWeekend || '18:30';
  const openStaff = options.staffingDemandConfig?.openingStaffCount ?? 2;
  const closeStaff = options.staffingDemandConfig?.closingStaffCount ?? 2;
  const peakStart = options.staffingDemandConfig?.peakStartTime || '11:30';
  const peakEnd = options.staffingDemandConfig?.peakEndTime || '13:30';
  const weekdayMax = options.staffingDemandConfig?.weekdayMaxStaff ?? 3;
  const weekendMax = options.staffingDemandConfig?.weekendMaxStaff ?? 4;

  const isPeakHour = (h: number): boolean => {
    const [psH, psM] = peakStart.split(':').map(Number);
    const [peH, peM] = peakEnd.split(':').map(Number);
    const psm = (psH || 0) * 60 + (psM || 0);
    const pem = (peH || 0) * 60 + (peM || 0);
    const hmStart = h * 60;
    const hmEnd = (h + 1) * 60;
    return Math.max(psm, hmStart) < Math.min(pem, hmEnd);
  };

  const targetSummary = options.dateRange.map(d => {
    const isWeekend = new Date(d + 'T00:00:00').getDay() === 0 || new Date(d + 'T00:00:00').getDay() === 6;
    const maxCap = isWeekend ? weekendMax : weekdayMax;
    const hourlyMap: Record<string, number> = {};
    for (let h = 6; h <= 19; h++) {
      if (isPeakHour(h)) {
        hourlyMap[`${h.toString().padStart(2, '0')}:00`] = maxCap;
        continue;
      }

      const dateMatch = options.staffingTargets.find(t => t.hour === h && t.date === d);
      const globalMatch = options.staffingTargets.find(t => t.hour === h && !t.date);
      let target = dateMatch ? dateMatch.targetCount : (globalMatch ? globalMatch.targetCount : 2);
      hourlyMap[`${h.toString().padStart(2, '0')}:00`] = Math.min(target, maxCap);
    }
    return { date: d, isWeekend, hourlyTargets: hourlyMap };
  });

  return {
    instructions: `1. **Opening Shifts & First 30 Minutes (${openStaff} workers)**
       - Weekdays (Mon-Fri): Store opens at ${opStartWk}. The opening 30-min window (${opStartWk} ~ ${addMinutesToTimeStr(opStartWk, 30)}) MUST have exactly ${openStaff} workers on duty starting at ${opStartWk}.
       - Weekends (Sat-Sun): Store opens at ${opStartWknd}. The opening 30-min window (${opStartWknd} ~ ${addMinutesToTimeStr(opStartWknd, 30)}) MUST have exactly ${openStaff} workers on duty starting at ${opStartWknd}.
       - On weekdays, the 2nd opening worker can be scheduled for a 5~6 hour shift (e.g. ${opStartWk}-12:00, >= 4h) to avoid afternoon headcount congestion and leave room for closing workers.
       - Rotate opening shifts among all qualified morning workers.

    2. **Closing Shifts & Last 30 Minutes (${closeStaff} workers) (CRITICAL)**
       - Weekdays (Mon-Fri): Store operating hours extend to ${opEndWk}. The closing 30-min window (${addMinutesToTimeStr(opEndWk, -30)} ~ ${opEndWk}) MUST have ${closeStaff} workers on duty through ${opEndWk}.
       - Weekends (Sat-Sun): Store operating hours extend to ${opEndWknd}. The closing 30-min window (${addMinutesToTimeStr(opEndWknd, -30)} ~ ${opEndWknd}) MUST have ${closeStaff} workers on duty through ${opEndWknd}.
       - Candidates whose registered availability extends to store closing MUST be scheduled with staggered later start times (e.g. 09:30-${opEndWk}, 10:00-${opEndWk}) to cover store closing.
       - Do NOT schedule everyone on early morning shifts leaving the closing window with 0 workers!

    3. **Peak Customer Hours (${peakStart} ~ ${peakEnd}) (Target = ${weekdayMax} on weekdays, ${weekendMax} on weekends)**
       - Peak hours (${peakStart} ~ ${peakEnd}) represent the highest customer traffic. Maintain strictly up to ${weekdayMax} workers on weekdays and up to ${weekendMax} workers on weekends.
       - The 3rd worker (and 4th weekend worker) MUST start around 09:00~10:00 (e.g. 09:00-15:00, 09:30-17:30) to cover peak hours, NEVER at store opening (${opStartWk}).
       - Actively assign available part-time workers to fill peak hours.

    4. **Strict Hourly Caps & Labor Standards Act**
       - Weekday Cap: Strictly MAX ${weekdayMax} workers per hour at any time (never ${weekdayMax + 1}).
       - Weekend Cap: Strictly MAX ${weekendMax} workers per hour at any time (never ${weekendMax + 1}).
       - Labor Law (一例一休): Maximum 5~6 consecutive working days. NEVER schedule any worker for 7 consecutive days across existing schedules and new shifts.
       - Shift Duration: 4 to 9 hours within each worker's registered time window. All workers MUST work in full hours (e.g. exactly 4, 5, 6, 7, 8 hours; NO 30-minute fractional durations like 4.5h or 5.5h. For example, if a worker works for 4 hours and 30 minutes, they should be scheduled for 4 hours).

    5. **Fair Rotation & Shift Balance**
       - Distribute weekend shifts and weekly hours evenly among all available staff.
       - If a worker has worked multiple days leading up to the weekend, give them a rest day on Saturday or Sunday to avoid consecutive day violations, while rotating in other available workers.

    6. **Complete Date Coverage (CRITICAL)**
       - You MUST process EVERY date in \`dateRange\` chronologically from first date to last date.
       - Ensure opening (${openStaff} workers), peak hours (${weekdayMax} weekdays, ${weekendMax} weekends), and closing (${closeStaff} workers) are addressed for every single date.

    Return ONLY JSON matching the specified schema.`,

    dateRange: options.dateRange,
    storeHourlyTargetsPerDate: targetSummary,
    existingConfirmedSchedules: options.schedules.map(s => ({
      who: s.employeeName.trim(),
      date: s.date,
      time: `${s.startTime}-${s.endTime}`
    })),
    availabilities: options.availabilities.map(a => {
      const emp = activeEmployees.find(e => e.name.trim().toLowerCase() === a.employeeName.trim().toLowerCase());
      const item: Record<string, any> = {
        id: a.id,
        date: a.date,
        who: a.employeeName.trim(),
        time: `${a.startTime}-${a.endTime}`
      };
      if (emp?.status) item.status = emp.status;
      if (a.notes && a.notes.trim()) item.notes = a.notes.trim();
      return item;
    })
  };
}

export async function runAIScheduler(options: RunAIScheduleOptions): Promise<ProposedAISchedule[]> {
  const apiKey = (options.apiKey || (import.meta.env.VITE_GEMINI_API_KEY as string) || '').trim();

  if (!apiKey) {
    throw new Error('MISSING_API_KEY');
  }

  const promptPayload = buildAIPromptPayload(options);
  console.log('🤖 [AI Prompt Payload debug]:\n', JSON.stringify(promptPayload, null, 2));

  const responseSchema = {
    type: "OBJECT",
    properties: {
      proposedSchedules: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            availabilityId: { type: "STRING" },
            employeeName: { type: "STRING" },
            date: { type: "STRING" },
            startTime: { type: "STRING" },
            endTime: { type: "STRING" },
            workplace: { type: "STRING" }
          },
          required: ["availabilityId", "employeeName", "date", "startTime", "endTime"]
        }
      }
    },
    required: ["proposedSchedules"]
  };

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          { text: JSON.stringify(promptPayload, null, 2) }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.1,
      topK: 1,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: responseSchema
    }
  };

  let lastError: Error | null = null;
  let rawText = '';

  const geminiModelsToTry = Array.from(new Set([
    options.modelName || 'gemini-3.1-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.5-flash'
  ]));

  for (const model of geminiModelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`Gemini model ${model} failed (${res.status}): ${errText}`);

        let errorMsg = `GEMINI_API_ERROR: ${res.status}`;
        try {
          const parsedErr = JSON.parse(errText);
          if (parsedErr?.error?.message) {
            errorMsg = `Gemini (${model}): ${parsedErr.error.message}`;
          }
        } catch {
          errorMsg = `Gemini (${model}): ${errText}`;
        }
        lastError = new Error(errorMsg);

        // If high demand (503) or rate limit (429), pause briefly before trying next fallback model
        if (res.status === 503 || res.status === 429) {
          await new Promise(r => setTimeout(r, 1000));
        }
        continue;
      }

      const data = await res.json();
      rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (rawText) {
        break; // Successfully got response
      }
    } catch (e: any) {
      console.warn(`Gemini model ${model} fetch exception:`, e);
      lastError = e;
    }
  }

  if (!rawText) {
    throw lastError || new Error('EMPTY_AI_RESPONSE');
  }

  const safeParseJSON = (text: string) => {
    let clean = text.trim();
    if (clean.includes('```')) {
      const match = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match && match[1]) clean = match[1].trim();
    }
    const startIdx = clean.indexOf('{');
    const endIdx = clean.lastIndexOf('}');
    if (startIdx !== -1 && endIdx > startIdx) {
      clean = clean.substring(startIdx, endIdx + 1);
    }
    return JSON.parse(clean);
  };

  let parsed: any = {};
  try {
    parsed = safeParseJSON(rawText);
  } catch (e) {
    console.warn('First pass JSON parse warning:', e);
  }

  const rawProposed = parsed?.proposedSchedules || [];

  // Helper to check if hour is active in shift
  const isShiftActiveAtHour = (sTime?: string, eTime?: string, hour?: number): boolean => {
    if (!sTime || !eTime || hour === undefined) return false;
    const [sH, sM] = sTime.split(':').map(Number);
    const [eH, eM] = eTime.split(':').map(Number);
    if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return false;
    const startMin = sH * 60 + sM;
    let endMin = eH * 60 + eM;
    if (endMin < startMin) endMin += 24 * 60;
    const checkMin = hour * 60 + 30;
    return checkMin >= startMin && checkMin < endMin;
  };

  // Code Guard: Filter out 7th consecutive work day AND over-staffing (> target + 1)
  const validatedProposed: ProposedAISchedule[] = [];
  const empWorkDates: Record<string, Set<string>> = {};
  const activeSchedules: WorkSchedule[] = [...options.schedules];

  options.schedules.forEach(s => {
    const empKey = s.employeeName.trim().toLowerCase();
    if (!empWorkDates[empKey]) empWorkDates[empKey] = new Set();
    empWorkDates[empKey].add(s.date);
  });

  const sortedProposed = [...rawProposed].sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));

  for (const item of sortedProposed) {
    if (!item.employeeName || !item.date || !item.startTime || !item.endTime) continue;
    const empKey = item.employeeName.trim().toLowerCase();
    if (!empWorkDates[empKey]) empWorkDates[empKey] = new Set();

    // Guard 1: 7 consecutive days rest law
    const candidateDates = Array.from(new Set([...Array.from(empWorkDates[empKey]), item.date]));
    if (hasSevenConsecutiveDays(candidateDates)) {
      console.warn(`🛡️ AI Safeguard: Dropped 7th consecutive work day shift for ${item.employeeName} on ${item.date}`);
      continue;
    }

    // Guard 2: Strict Over-staffing Cap (Weekdays max weekdayMaxStaff, Weekends max weekendMaxStaff)
    const weekdayMax = options.staffingDemandConfig?.weekdayMaxStaff ?? 3;
    const weekendMax = options.staffingDemandConfig?.weekendMaxStaff ?? 4;

    let causesExcessiveOverstaffing = false;
    for (let h = 5; h <= 21; h++) {
      if (isShiftActiveAtHour(item.startTime, item.endTime, h)) {
        const isWeekend = new Date(item.date + 'T00:00:00').getDay() === 0 || new Date(item.date + 'T00:00:00').getDay() === 6;
        const maxAllowedCap = isWeekend ? weekendMax : weekdayMax;

        const currentHeadcount = activeSchedules.filter(
          s => s.date === item.date && isShiftActiveAtHour(s.startTime, s.endTime, h)
        ).length;

        // Strict Cap: Reject shift if headcount would reach or exceed maxAllowedCap
        if (currentHeadcount >= maxAllowedCap) {
          causesExcessiveOverstaffing = true;
          break;
        }
      }
    }

    if (causesExcessiveOverstaffing) {
      console.warn(`🛡️ AI Safeguard: Dropped over-staffing shift for ${item.employeeName} on ${item.date} (${item.startTime}-${item.endTime})`);
      continue;
    }

    empWorkDates[empKey].add(item.date);

    const origAvail = options.availabilities.find(a => a.id === item.availabilityId);
    const validShift: ProposedAISchedule = {
      availabilityId: item.availabilityId,
      employeeName: item.employeeName.trim(),
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime,
      workplace: item.workplace || origAvail?.workplace || '埔里酒廠門市',
      notes: '',
      workerNotes: origAvail?.notes ? origAvail.notes.trim() : '',
      managerNotes: '',
      scheduleSource: 'ai',
      shiftType: '自訂班',
      reasoning: item.reasoning
    };

    validatedProposed.push(validShift);
    activeSchedules.push({
      id: item.availabilityId,
      employeeName: item.employeeName.trim(),
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime,
      workplace: validShift.workplace
    } as any);
  }

  return validatedProposed;
}
