import type { WorkSchedule, WorkerAvailability, Employee, StaffingTarget } from './scheduler';
import { hasSevenConsecutiveDays } from '../utils/dateUtils';

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
}

export function buildAIPromptPayload(options: RunAIScheduleOptions) {
  const activeEmployees = options.employees.filter(e => e.active !== false);

  const targetSummary = options.dateRange.map(d => {
    const isWeekend = new Date(d + 'T00:00:00').getDay() === 0 || new Date(d + 'T00:00:00').getDay() === 6;
    const hourlyMap: Record<string, number> = {};
    for (let h = 6; h <= 18; h++) {
      const dateMatch = options.staffingTargets.find(t => t.hour === h && t.date === d);
      const globalMatch = options.staffingTargets.find(t => t.hour === h && !t.date);
      let target = dateMatch ? dateMatch.targetCount : (globalMatch ? globalMatch.targetCount : 2);
      if (isWeekend && h >= 10 && h < 15) {
        target += 1;
      }
      hourlyMap[`${h.toString().padStart(2, '0')}:00`] = target;
    }
    return { date: d, isWeekend, hourlyTargets: hourlyMap };
  });

  return {
    instructions: `1. **Opening (06:00–08:00, target = 2)**
   If 2 or more workers in \`availabilities\` are available starting at 06:30, assign exactly 2 of them at 06:30 so the target is fully met. Never leave this window at 1/2 if 2 eligible workers exist.

    2. **Closing (target = 2 through 17:00–18:00)**
   Prioritize workers whose \`time\` ends at 17:00 or later for closing shifts.
   Assign as many as are actually available — if fewer than 2 qualify (or none),
   assign whoever is eligible and leave any remaining gap unfilled. Do not
   invent shifts outside a worker's registered \`time\` window to force coverage.

    3. **Midday cap (09:00–15:00)**
      Do not exceed the hourly target by more than +1 (max 4 on weekdays, 5 on weekends). Stop assigning once an hour hits its cap — never schedule 6+ overlapping workers.

    4. **Fair rotation**
      Every registered worker in \`availabilities\` should get shifts when unfilled targets remain for that date. Avoid stacking one worker 8–10 days straight while another gets zero shifts.

    5. **No 7 consecutive workdays**
   Check \`existingSchedules\` (shifts already assigned before this date range)
   together with any new shifts you assign. No worker may work 7 consecutive
   days counting both. If a worker's existing streak is already at 6 days
   entering this range, their first day here must be a rest day.

    6. **Part-time shift bounds**
      The \`time\` property (e.g. \`06:30-17:30\`) is a worker's max availability window. Trim as needed to fit store demand (e.g. \`06:30-17:30\` can become \`08:30-17:30\`). Assigned shift length must be 240–540 minutes (4–9 hours). Map \`id\` -> \`availabilityId\` and \`who\` -> \`employeeName\` in response.

    Return ONLY JSON matching the specified schema.`,

    dateRange: options.dateRange,
    storeHourlyTargetsPerDate: targetSummary,
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
    }),
    existingSchedulesCount: options.schedules.length
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
            workplace: { type: "STRING" },
            reasoning: { type: "STRING" }
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
      responseMimeType: "application/json",
      responseSchema: responseSchema
    }
  };

  let lastError: Error | null = null;
  let rawText = '';

  const geminiModelsToTry = Array.from(new Set([
    options.modelName || 'gemini-3.5-flash',
    'gemini-3.1-pro-preview'

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
        lastError = new Error(`GEMINI_API_ERROR: ${res.status} - ${errText}`);
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

    // Guard 2: Strict Over-staffing Cap (Do not allow headcount to exceed target + 1)
    let causesExcessiveOverstaffing = false;
    for (let h = 6; h <= 18; h++) {
      if (isShiftActiveAtHour(item.startTime, item.endTime, h)) {
        const dateMatch = options.staffingTargets.find(t => t.hour === h && t.date === item.date);
        const globalMatch = options.staffingTargets.find(t => t.hour === h && !t.date);
        let target = dateMatch ? dateMatch.targetCount : (globalMatch ? globalMatch.targetCount : 2);
        const isWeekend = new Date(item.date + 'T00:00:00').getDay() === 0 || new Date(item.date + 'T00:00:00').getDay() === 6;
        if (isWeekend && h >= 10 && h < 15) target += 1;

        const currentHeadcount = activeSchedules.filter(
          s => s.date === item.date && isShiftActiveAtHour(s.startTime, s.endTime, h)
        ).length;

        // Strict Cap: Max allowed headcount at any hour is target + 1
        if (currentHeadcount >= target + 1) {
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
      notes: `🤖 Gemini AI 智慧排班: ${item.reasoning || '符合最佳人力效益與工時法規'}`,
      workerNotes: origAvail?.notes || '',
      managerNotes: `🤖 AI 智慧分析: ${item.reasoning || ''}`,
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
