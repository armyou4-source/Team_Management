const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export const formatReportDate = (value: Date): string => {
  const year = value.getFullYear();
  const month = value.getMonth() + 1;
  const day = value.getDate();
  const weekday = WEEKDAY_LABELS[value.getDay()];
  return `${year}.${month}.${day}(${weekday})`;
};

export const parseIsoDateString = (value: string): Date | null => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
};

export interface AccidentDatetimeParts {
  dateIso: string;
  startHour: string;
  startMinute: string;
  startSecond: string;
  endHour: string;
  endMinute: string;
  endSecond: string;
}

export const createEmptyAccidentDatetimeParts = (): AccidentDatetimeParts => ({
  dateIso: '',
  startHour: '',
  startMinute: '',
  startSecond: '',
  endHour: '',
  endMinute: '',
  endSecond: '',
});

const ACCIDENT_DATETIME_PATTERN =
  /^(\d{4})\.(\d{1,2})\.(\d{1,2})\(([월화수목금토일])\)\s+(\d{1,2}):(\d{2}):(\d{2})\s+~\s+(\d{1,2}):(\d{2}):(\d{2}),\s+.+\s+동안$/;

const DATE_ONLY_PATTERN = /^(\d{4})\.(\d{1,2})\.(\d{1,2})\(([월화수목금토일])\)$/;

const parseDateIsoFromMatch = (year: string, month: string, day: string): string =>
  `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

export const serializeAccidentDatetimeParts = (parts: AccidentDatetimeParts): string => {
  const full = buildAccidentDatetimeString(parts);
  if (full.includes('~')) {
    return full;
  }

  if (!parts.dateIso.trim()) {
    return '';
  }

  const parsedDate = parseIsoDateString(parts.dateIso);
  return parsedDate ? formatReportDate(parsedDate) : '';
};

const parseTimeSegment = (value: string, max: number): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > max) return null;
  return Math.floor(parsed);
};

const formatTimeSegment = (value: number): string => String(value).padStart(2, '0');

export const calculateAccidentDurationSeconds = (parts: AccidentDatetimeParts): number | null => {
  const startHour = parseTimeSegment(parts.startHour, 23);
  const startMinute = parseTimeSegment(parts.startMinute, 59);
  const startSecond = parseTimeSegment(parts.startSecond, 59);
  const endHour = parseTimeSegment(parts.endHour, 23);
  const endMinute = parseTimeSegment(parts.endMinute, 59);
  const endSecond = parseTimeSegment(parts.endSecond, 59);

  if (
    startHour === null ||
    startMinute === null ||
    startSecond === null ||
    endHour === null ||
    endMinute === null ||
    endSecond === null
  ) {
    return null;
  }

  const startTotal = startHour * 3600 + startMinute * 60 + startSecond;
  const endTotal = endHour * 3600 + endMinute * 60 + endSecond;
  const diff = endTotal - startTotal;
  return diff >= 0 ? diff : null;
};

export const formatAccidentDurationKorean = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const chunks: string[] = [];

  if (hours > 0) chunks.push(`${hours}시간`);
  if (minutes > 0) chunks.push(`${minutes}분`);
  if (seconds > 0 || chunks.length === 0) chunks.push(`${seconds}초`);

  return `${chunks.join(' ')} 동안`;
};

export const buildAccidentDatetimeString = (parts: AccidentDatetimeParts): string => {
  if (!parts.dateIso.trim()) {
    return '';
  }

  const parsedDate = parseIsoDateString(parts.dateIso);
  if (!parsedDate) {
    return '';
  }

  const dateLabel = formatReportDate(parsedDate);
  const durationSeconds = calculateAccidentDurationSeconds(parts);
  if (durationSeconds === null) {
    return dateLabel;
  }

  const startHour = parseTimeSegment(parts.startHour, 23)!;
  const startMinute = parseTimeSegment(parts.startMinute, 59)!;
  const startSecond = parseTimeSegment(parts.startSecond, 59)!;
  const endHour = parseTimeSegment(parts.endHour, 23)!;
  const endMinute = parseTimeSegment(parts.endMinute, 59)!;
  const endSecond = parseTimeSegment(parts.endSecond, 59)!;

  const startTime = `${formatTimeSegment(startHour)}:${formatTimeSegment(startMinute)}:${formatTimeSegment(startSecond)}`;
  const endTime = `${formatTimeSegment(endHour)}:${formatTimeSegment(endMinute)}:${formatTimeSegment(endSecond)}`;
  const durationLabel = formatAccidentDurationKorean(durationSeconds);

  return `${dateLabel} ${startTime} ~ ${endTime}, ${durationLabel}`;
};

export const parseAccidentDatetime = (value: string): AccidentDatetimeParts => {
  const trimmed = value.trim();
  if (!trimmed) {
    return createEmptyAccidentDatetimeParts();
  }

  const fullMatch = trimmed.match(ACCIDENT_DATETIME_PATTERN);
  if (fullMatch) {
    const [, year, month, day] = fullMatch;
    return {
      dateIso: parseDateIsoFromMatch(year, month, day),
      startHour: fullMatch[5],
      startMinute: fullMatch[6],
      startSecond: fullMatch[7],
      endHour: fullMatch[8],
      endMinute: fullMatch[9],
      endSecond: fullMatch[10],
    };
  }

  const dateOnlyMatch = trimmed.match(DATE_ONLY_PATTERN);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return {
      ...createEmptyAccidentDatetimeParts(),
      dateIso: parseDateIsoFromMatch(year, month, day),
    };
  }

  return createEmptyAccidentDatetimeParts();
};

export const formatAccidentDatetimePreview = (parts: AccidentDatetimeParts): string => {
  const built = buildAccidentDatetimeString(parts);
  if (built.includes('~')) {
    return built;
  }

  return '';
};
