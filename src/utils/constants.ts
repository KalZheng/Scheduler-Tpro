export const ALL_POSITIONS: ('餐吧' | 'POS機' | '後吧' | '收班' | '開早')[] = [
  '餐吧', 'POS機', '後吧', '收班', '開早'
];

export const DAYS_OF_WEEK = [
  { value: 1, name: '週一', english: 'Monday', short: 'Mon' },
  { value: 2, name: '週二', english: 'Tuesday', short: 'Tue' },
  { value: 3, name: '週三', english: 'Wednesday', short: 'Wed' },
  { value: 4, name: '週四', english: 'Thursday', short: 'Thu' },
  { value: 5, name: '週五', english: 'Friday', short: 'Fri' },
  { value: 6, name: '週六', english: 'Saturday', short: 'Sat' },
  { value: 7, name: '週日', english: 'Sunday', short: 'Sun' }
];

export const ALL_TIME_CHOICES = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

export const COLOR_THEMES: Record<string, { bg: string; border: string; text: string; dot: string; hover: string; badgeBg: string }> = {
  indigo: {
    bg: 'bg-[#5D4037]/8',
    border: 'border-[#4E342E]/25',
    text: 'text-[#3E2723]',
    dot: 'bg-[#4E342E]',
    hover: 'hover:border-[#4E342E]/50 hover:bg-[#5D4037]/12',
    badgeBg: 'bg-[#4E342E]'
  },
  emerald: {
    bg: 'bg-[#2E7D32]/8',
    border: 'border-[#2E7D32]/25',
    text: 'text-[#1B5E20]',
    dot: 'bg-[#2E7D32]',
    hover: 'hover:border-[#2E7D32]/50 hover:bg-[#2E7D32]/12',
    badgeBg: 'bg-[#2E7D32]'
  },
  violet: {
    bg: 'bg-[#8D6E63]/10',
    border: 'border-[#8D6E63]/30',
    text: 'text-[#5D4037]',
    dot: 'bg-[#8D6E63]',
    hover: 'hover:border-[#8D6E63]/60 hover:bg-[#8D6E63]/15',
    badgeBg: 'bg-[#8D6E63]'
  },
  amber: {
    bg: 'bg-[#E65100]/8',
    border: 'border-[#E65100]/25',
    text: 'text-[#BF360C]',
    dot: 'bg-[#E65100]',
    hover: 'hover:border-[#E65100]/50 hover:bg-[#E65100]/12',
    badgeBg: 'bg-[#E65100]'
  },
  rose: {
    bg: 'bg-[#D7CCC8]/35',
    border: 'border-[#BCAAA4]/40',
    text: 'text-[#6D4C41]',
    dot: 'bg-[#A1887F]',
    hover: 'hover:border-[#BCAAA4]/70 hover:bg-[#D7CCC8]/50',
    badgeBg: 'bg-[#8D6E63]'
  },
  teal: {
    bg: 'bg-teal-50',
    border: 'border-teal-500/40',
    text: 'text-teal-900',
    dot: 'bg-teal-600',
    hover: 'hover:border-teal-500 hover:bg-teal-100/70',
    badgeBg: 'bg-teal-600'
  },
  purple: {
    bg: 'bg-purple-50',
    border: 'border-purple-500/40',
    text: 'text-purple-900',
    dot: 'bg-purple-600',
    hover: 'hover:border-purple-500 hover:bg-purple-100/70',
    badgeBg: 'bg-purple-600'
  },
  blue: {
    bg: 'bg-blue-50',
    border: 'border-blue-500/40',
    text: 'text-blue-900',
    dot: 'bg-blue-600',
    hover: 'hover:border-blue-500 hover:bg-blue-100/70',
    badgeBg: 'bg-blue-600'
  },
  lightBlue: {
    bg: '!bg-[#E0F2FE]',
    border: '!border-[#bae6fd]',
    text: 'text-[#0369a1]',
    dot: 'bg-[#0284c7]',
    hover: 'hover:border-[#38bdf8] hover:bg-[#e0f2fe]/90',
    badgeBg: 'bg-[#0284c7]'
  }
};
