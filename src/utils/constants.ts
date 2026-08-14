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
  skyBlue: {
    bg: 'bg-[#E0F2FE]',
    border: 'border-[#0284C7]',
    text: 'text-[#0369A1]',
    dot: 'bg-[#0284C7]',
    hover: 'hover:bg-[#BAE6FD]',
    badgeBg: 'bg-[#0284C7]'
  },
  crimson: {
    bg: 'bg-[#FFE4E6]',
    border: 'border-[#E11D48]',
    text: 'text-[#9F1239]',
    dot: 'bg-[#E11D48]',
    hover: 'hover:bg-[#FECDD3]',
    badgeBg: 'bg-[#E11D48]'
  },
  amberGold: {
    bg: 'bg-[#FEF3C7]',
    border: 'border-[#D97706]',
    text: 'text-[#78350F]',
    dot: 'bg-[#D97706]',
    hover: 'hover:bg-[#FDE68A]',
    badgeBg: 'bg-[#D97706]'
  },
  emeraldGreen: {
    bg: 'bg-[#DCFCE7]',
    border: 'border-[#16A34A]',
    text: 'text-[#14532D]',
    dot: 'bg-[#16A34A]',
    hover: 'hover:bg-[#BBF7D0]',
    badgeBg: 'bg-[#16A34A]'
  },
  deepPurple: {
    bg: 'bg-[#F3E8FF]',
    border: 'border-[#9333EA]',
    text: 'text-[#581C87]',
    dot: 'bg-[#9333EA]',
    hover: 'hover:bg-[#E9D5FF]',
    badgeBg: 'bg-[#9333EA]'
  },
  hotPink: {
    bg: 'bg-[#FAE8FF]',
    border: 'border-[#C026D3]',
    text: 'text-[#701A75]',
    dot: 'bg-[#C026D3]',
    hover: 'hover:bg-[#F5D0FE]',
    badgeBg: 'bg-[#C026D3]'
  },
  warmOrange: {
    bg: 'bg-[#FFEDD5]',
    border: 'border-[#EA580C]',
    text: 'text-[#7C2D12]',
    dot: 'bg-[#EA580C]',
    hover: 'hover:bg-[#FED7AA]',
    badgeBg: 'bg-[#EA580C]'
  },
  slateSteel: {
    bg: 'bg-[#F1F5F9]',
    border: 'border-[#475569]',
    text: 'text-[#0F172A]',
    dot: 'bg-[#475569]',
    hover: 'hover:bg-[#E2E8F0]',
    badgeBg: 'bg-[#475569]'
  },
  coffeeBrown: {
    bg: 'bg-[#EFEBE9]',
    border: 'border-[#5D4037]',
    text: 'text-[#3E2723]',
    dot: 'bg-[#5D4037]',
    hover: 'hover:bg-[#D7CCC8]',
    badgeBg: 'bg-[#5D4037]'
  },
  cyanAqua: {
    bg: 'bg-[#E0F7FA]',
    border: 'border-[#00ACC1]',
    text: 'text-[#006064]',
    dot: 'bg-[#00ACC1]',
    hover: 'hover:bg-[#B2EBF2]',
    badgeBg: 'bg-[#00ACC1]'
  },
  emerald: {
    bg: 'bg-[#E8F5E9]',
    border: 'border-[#2E7D32]',
    text: 'text-[#1B5E20]',
    dot: 'bg-[#2E7D32]',
    hover: 'hover:bg-[#C8E6C9]',
    badgeBg: 'bg-[#2E7D32]'
  },
  amber: {
    bg: 'bg-[#FFF3E0]',
    border: 'border-[#EF6C00]',
    text: 'text-[#E65100]',
    dot: 'bg-[#EF6C00]',
    hover: 'hover:bg-[#FFE0B2]',
    badgeBg: 'bg-[#EF6C00]'
  },
  teal: {
    bg: 'bg-[#E0F2F1]',
    border: 'border-[#00897B]',
    text: 'text-[#004D40]',
    dot: 'bg-[#00897B]',
    hover: 'hover:bg-[#B2DFDB]',
    badgeBg: 'bg-[#00897B]'
  },
  indigo: {
    bg: 'bg-[#EFEBE9]',
    border: 'border-[#6D4C41]',
    text: 'text-[#3E2723]',
    dot: 'bg-[#5D4037]',
    hover: 'hover:bg-[#D7CCC8]',
    badgeBg: 'bg-[#5D4037]'
  },
  purple: {
    bg: 'bg-[#F3E5F5]',
    border: 'border-[#8E24AA]',
    text: 'text-[#4A148C]',
    dot: 'bg-[#8E24AA]',
    hover: 'hover:bg-[#E1BEE7]',
    badgeBg: 'bg-[#8E24AA]'
  },
  rose: {
    bg: 'bg-[#FFEBEE]',
    border: 'border-[#C2185B]',
    text: 'text-[#880E4F]',
    dot: 'bg-[#C2185B]',
    hover: 'hover:bg-[#FFCDD2]',
    badgeBg: 'bg-[#C2185B]'
  },
  blue: {
    bg: 'bg-[#E3F2FD]',
    border: 'border-[#1E88E5]',
    text: 'text-[#0D47A1]',
    dot: 'bg-[#1E88E5]',
    hover: 'hover:bg-[#BBDEFB]',
    badgeBg: 'bg-[#1E88E5]'
  },
  violet: {
    bg: 'bg-[#F3E5F5]',
    border: 'border-[#7B1FA2]',
    text: 'text-[#4A148C]',
    dot: 'bg-[#7B1FA2]',
    hover: 'hover:bg-[#E1BEE7]',
    badgeBg: 'bg-[#7B1FA2]'
  },
  lightBlue: {
    bg: 'bg-[#E0F2FE]',
    border: 'border-[#0284C7]',
    text: 'text-[#0369A1]',
    dot: 'bg-[#0284C7]',
    hover: 'hover:bg-[#BAE6FD]',
    badgeBg: 'bg-[#0284C7]'
  }
};
