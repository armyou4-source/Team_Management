import type { DashboardEmployee } from './teamMemberService';
import { normalizeMemberCategory, parseBirthDate } from './teamMemberService';

export const TEMPORARY_EMPLOYMENT_CATEGORIES = ['계약직', '파견직'] as const;
export const TENURE_YEARS = 2;
export const DEFAULT_REMINDER_MONTHS_BEFORE = 2;
export const CONTRACT_REMINDER_MONTHS_BEFORE = 3;
export const DISPATCH_REMINDER_MONTHS_BEFORE = 2;

export type TenureStatusType = 'active' | 'reminder_window' | 'expired' | 'unknown_hire_date';

export interface TenureStatus {
  employee: DashboardEmployee;
  hireDate: Date | null;
  expiryDate: Date | null;
  reminderDate: Date | null;
  daysUntilExpiry: number | null;
  daysUntilReminder: number | null;
  status: TenureStatusType;
}

export const parseHireDate = parseBirthDate;

export const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const addYears = (date: Date, years: number): Date => {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
};

export const subtractMonths = (date: Date, months: number): Date => {
  const normalized = startOfDay(date);
  const targetMonthIndex = normalized.getMonth() - months;
  const year = normalized.getFullYear() + Math.floor(targetMonthIndex / 12);
  const month = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const day = Math.min(normalized.getDate(), lastDayOfMonth);
  return startOfDay(new Date(year, month, day));
};

export const subtractDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() - days);
  return next;
};

export const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

/** 입사일 기준 2년 - 1일이 근무 만기일 */
export const calculateExpiryDate = (hireDate: Date): Date =>
  startOfDay(subtractDays(addYears(hireDate, TENURE_YEARS), 1));

export const diffDays = (from: Date, to: Date): number => {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / msPerDay);
};

export const formatDateKorean = (date: Date): string =>
  `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;

export const formatDateDot = (date: Date): string =>
  `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;

export const formatDateIso = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const isTemporaryEmployee = (employee: Pick<DashboardEmployee, 'category'>): boolean =>
  TEMPORARY_EMPLOYMENT_CATEGORIES.includes(
    normalizeMemberCategory(employee.category) as (typeof TEMPORARY_EMPLOYMENT_CATEGORIES)[number]
  );

export const getReminderMonthsBefore = (category: string | null | undefined): number => {
  const normalized = normalizeMemberCategory(category);
  if (normalized === '계약직') return CONTRACT_REMINDER_MONTHS_BEFORE;
  if (normalized === '파견직') return DISPATCH_REMINDER_MONTHS_BEFORE;
  return DEFAULT_REMINDER_MONTHS_BEFORE;
};

export const formatReminderLeadTime = (category: string | null | undefined): string =>
  `${getReminderMonthsBefore(category)}개월`;

export const formatReminderMonthsBeforeExpiry = (
  category: string | null | undefined
): string => `만기 ${getReminderMonthsBefore(category)}개월 전`;

export const getCategoryBadgeClass = (category: string | null | undefined): string => {
  const normalized = normalizeMemberCategory(category);
  if (normalized === '계약직') return 'contract';
  if (normalized === '파견직') return 'dispatch';
  return 'unknown';
};

export const getCategoryBadgeLabel = (category: string | null | undefined): string => {
  const normalized = normalizeMemberCategory(category);
  return normalized || '구분 미등록';
};

const TENURE_CATEGORY_SORT_ORDER = ['계약직', '파견직'] as const;

const compareTenureCategoryOrder = (categoryA: string, categoryB: string): number => {
  const rankA = TENURE_CATEGORY_SORT_ORDER.indexOf(
    categoryA as (typeof TENURE_CATEGORY_SORT_ORDER)[number]
  );
  const rankB = TENURE_CATEGORY_SORT_ORDER.indexOf(
    categoryB as (typeof TENURE_CATEGORY_SORT_ORDER)[number]
  );
  const orderA = rankA === -1 ? TENURE_CATEGORY_SORT_ORDER.length : rankA;
  const orderB = rankB === -1 ? TENURE_CATEGORY_SORT_ORDER.length : rankB;
  if (orderA !== orderB) return orderA - orderB;
  return categoryA.localeCompare(categoryB, 'ko');
};

const compareTenureRemainingDays = (a: TenureStatus, b: TenureStatus): number => {
  const daysA = a.daysUntilExpiry;
  const daysB = b.daysUntilExpiry;

  if (daysA === null && daysB === null) {
    return a.employee.name.localeCompare(b.employee.name, 'ko');
  }
  if (daysA === null) return 1;
  if (daysB === null) return -1;
  if (daysA !== daysB) return daysA - daysB;

  return a.employee.name.localeCompare(b.employee.name, 'ko');
};

export const buildTenureStatus = (
  employee: DashboardEmployee,
  referenceDate: Date
): TenureStatus => {
  const hireDate = parseHireDate(employee.hireDate);
  const ref = startOfDay(referenceDate);

  if (!hireDate) {
    return {
      employee,
      hireDate: null,
      expiryDate: null,
      reminderDate: null,
      daysUntilExpiry: null,
      daysUntilReminder: null,
      status: 'unknown_hire_date',
    };
  }

  const expiryDate = calculateExpiryDate(hireDate);
  const reminderMonthsBefore = getReminderMonthsBefore(employee.category);
  const reminderDate = startOfDay(subtractMonths(expiryDate, reminderMonthsBefore));
  const daysUntilExpiry = diffDays(ref, expiryDate);
  const daysUntilReminder = diffDays(ref, reminderDate);

  let status: TenureStatusType = 'active';
  if (ref > expiryDate) {
    status = 'expired';
  } else if (ref >= reminderDate) {
    status = 'reminder_window';
  }

  return {
    employee,
    hireDate: startOfDay(hireDate),
    expiryDate,
    reminderDate,
    daysUntilExpiry,
    daysUntilReminder,
    status,
  };
};

export const buildTenureStatuses = (
  employees: DashboardEmployee[],
  referenceDate: Date
): TenureStatus[] =>
  employees
    .filter(isTemporaryEmployee)
    .map((employee) => buildTenureStatus(employee, referenceDate))
    .sort((a, b) => {
      const categoryCompare = compareTenureCategoryOrder(
        normalizeMemberCategory(a.employee.category),
        normalizeMemberCategory(b.employee.category)
      );
      if (categoryCompare !== 0) return categoryCompare;
      return compareTenureRemainingDays(a, b);
    });

export const getTenureStatusLabel = (status: TenureStatusType): string => {
  switch (status) {
    case 'reminder_window':
      return '대체채용 요청';
    case 'expired':
      return '근무 만기';
    case 'unknown_hire_date':
      return '입사일 미등록';
    default:
      return '근무 중';
  }
};

/** 좌측 구성원 목록 배지: 근무 중이면 소속 표시 */
export const getTenureListBadgeLabel = (tenure: TenureStatus): string => {
  if (tenure.status === 'active') {
    return tenure.employee.department || '미지정';
  }
  return getTenureStatusLabel(tenure.status);
};

export const getTenureListBadgeClass = (tenure: TenureStatus): string => {
  if (tenure.status === 'active') return 'department';
  return getTenureStatusClass(tenure.status);
};

export const getTenureStatusClass = (status: TenureStatusType): string => {
  switch (status) {
    case 'reminder_window':
      return 'reminder';
    case 'expired':
      return 'expired';
    case 'unknown_hire_date':
      return 'unknown';
    default:
      return 'active';
  }
};

const formatGoogleCalendarDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

export const buildGoogleCalendarUrl = (params: {
  title: string;
  date: Date;
  description: string;
}): string => {
  const start = formatGoogleCalendarDate(params.date);
  const endDate = new Date(params.date);
  endDate.setDate(endDate.getDate() + 1);
  const end = formatGoogleCalendarDate(endDate);

  const query = new URLSearchParams({
    action: 'TEMPLATE',
    text: params.title,
    dates: `${start}/${end}`,
    details: params.description,
  });

  return `https://calendar.google.com/calendar/render?${query.toString()}`;
};

export const buildReminderCalendarUrl = (
  tenure: TenureStatus,
  leaderName: string
): string | null => {
  if (!tenure.reminderDate) return null;

  const category = normalizeMemberCategory(tenure.employee.category);
  const title = `[인력 채용 요청] ${tenure.employee.name} (${category})`;
  const description = [
    `팀장: ${leaderName}`,
    `대상: ${tenure.employee.name} (${category})`,
    `소속: ${tenure.employee.department}`,
    `사번: ${tenure.employee.displayId}`,
    `입사일: ${tenure.hireDate ? formatDateKorean(tenure.hireDate) : '-'}`,
    `근무 만기: ${tenure.expiryDate ? formatDateKorean(tenure.expiryDate) : '-'}`,
    '',
    `만기 ${formatReminderLeadTime(tenure.employee.category)} 전 인사부에 대체 채용을 요청해 주세요.`,
  ].join('\n');

  return buildGoogleCalendarUrl({ title, date: tenure.reminderDate, description });
};

export const buildExpiryCalendarUrl = (
  tenure: TenureStatus,
  leaderName: string
): string | null => {
  if (!tenure.expiryDate) return null;

  const category = normalizeMemberCategory(tenure.employee.category);
  const checkDate = subtractMonths(tenure.expiryDate, 1);
  const title = `[만기 1개월 전] ${tenure.employee.name} (${category})`;
  const description = [
    `팀장: ${leaderName}`,
    `대상: ${tenure.employee.name} (${category})`,
    `소속: ${tenure.employee.department}`,
    `사번: ${tenure.employee.displayId}`,
    `입사일: ${tenure.hireDate ? formatDateKorean(tenure.hireDate) : '-'}`,
    `근무 만기: ${formatDateKorean(tenure.expiryDate)}`,
    '',
    '근무 만기 1개월 전 확인 일정입니다. 후속 인력 계획을 점검해 주세요.',
  ].join('\n');

  return buildGoogleCalendarUrl({ title, date: checkDate, description });
};

const HR_EMAIL = import.meta.env.VITE_HR_EMAIL?.trim() || '';

export const buildHrReplacementEmailUrl = (
  tenure: TenureStatus,
  leader: { name: string; department: string; email?: string | null }
): string | null => {
  if (!tenure.expiryDate) return null;

  const category = normalizeMemberCategory(tenure.employee.category);
  const subject = `[대체채용요청] ${tenure.employee.department} ${tenure.employee.name} (${category}) 근무 만기 예정`;
  const body = [
    '인사부 담당자님,',
    '',
    '아래 구성원의 근무 만기가 도래하여 대체 채용을 요청드립니다.',
    '',
    `- 요청 팀장: ${leader.name} (${leader.department})`,
    leader.email ? `- 팀장 이메일: ${leader.email}` : '',
    `- 대상자: ${tenure.employee.name}`,
    `- 구분: ${category}`,
    `- 소속: ${tenure.employee.department}`,
    `- 사번: ${tenure.employee.displayId}`,
    `- 입사일: ${tenure.hireDate ? formatDateKorean(tenure.hireDate) : '-'}`,
    `- 근무 만기: ${formatDateKorean(tenure.expiryDate)}`,
    `- 인력 충원 요청일: ${tenure.reminderDate ? formatDateKorean(tenure.reminderDate) : '-'}`,
    '',
    '검토 부탁드립니다.',
    '',
    leader.name,
  ]
    .filter(Boolean)
    .join('\n');

  const params = new URLSearchParams({
    subject,
    body,
  });

  if (leader.email) {
    params.set('cc', leader.email);
  }

  const base = HR_EMAIL ? `mailto:${encodeURIComponent(HR_EMAIL)}` : 'mailto:';
  return `${base}?${params.toString()}`;
};

export const openExternalUrl = (url: string): void => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

export interface TenureExpiryMonthBucket {
  key: string;
  year: number;
  month: number;
  label: string;
  count: number;
  members: TenureStatus[];
}

export interface TenureExpiryDateGroup {
  key: string;
  label: string;
  date: Date;
  members: TenureStatus[];
}

export const getTenureExpiryMonthKey = (date: Date): string =>
  `${date.getFullYear()}-${date.getMonth() + 1}`;

export const parseTenureExpiryMonthKey = (
  key: string
): { year: number; month: number } | null => {
  const match = key.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return null;
  const year = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10);
  if (month < 1 || month > 12) return null;
  return { year, month };
};

export const buildTenureExpiryMonthBuckets = (
  statuses: TenureStatus[]
): TenureExpiryMonthBucket[] => {
  const grouped = new Map<string, TenureStatus[]>();

  statuses.forEach((status) => {
    if (!status.expiryDate) return;
    const key = getTenureExpiryMonthKey(status.expiryDate);
    const list = grouped.get(key) ?? [];
    list.push(status);
    grouped.set(key, list);
  });

  return [...grouped.entries()]
    .map(([key, members]) => {
      const sortedMembers = [...members].sort(compareTenureRemainingDays);
      const sampleDate = sortedMembers[0]!.expiryDate!;
      const year = sampleDate.getFullYear();
      const month = sampleDate.getMonth() + 1;
      return {
        key,
        year,
        month,
        label: `${year}년 ${month}월`,
        count: sortedMembers.length,
        members: sortedMembers,
      };
    })
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
};

export const TENURE_CHART_YEAR_SPAN = 3;
export const TENURE_CHART_COLUMN_COUNT = 12;
export const TENURE_CHART_COLUMN_GAP_PX = 3;

/** 0(Jan 1) ~ 12(Dec 31) 연간 타임라인 위치 */
export const getYearTimelineColumn = (date: Date): number => {
  const month = date.getMonth();
  const day = date.getDate();
  const daysInMonth = new Date(date.getFullYear(), month + 1, 0).getDate();
  return month + (day - 1) / daysInMonth;
};

/** 12열 그리드 gap을 반영한 현재 시점 세로선 left 값 */
export const buildTenureNowLineLeft = (
  date: Date,
  columnCount = TENURE_CHART_COLUMN_COUNT,
  gapPx = TENURE_CHART_COLUMN_GAP_PX
): string => {
  const col = getYearTimelineColumn(date);
  const gapCount = Math.min(columnCount - 1, Math.max(0, Math.floor(col)));
  const totalGap = (columnCount - 1) * gapPx;
  return `calc(${col} * (100% - ${totalGap}px) / ${columnCount} + ${gapCount * gapPx}px)`;
};

export const buildTenureChartYearRows = (
  buckets: TenureExpiryMonthBucket[],
  referenceDate: Date
): Array<{ year: number; totalCount: number; months: Array<TenureExpiryMonthBucket | null> }> => {
  const startYear = referenceDate.getFullYear();
  const years = Array.from({ length: TENURE_CHART_YEAR_SPAN }, (_, index) => startYear + index);

  return years.map((year) => {
    const yearBuckets = buckets.filter((bucket) => bucket.year === year);
    const bucketByMonth = new Map(
      yearBuckets.map((bucket) => [bucket.month, bucket])
    );
    return {
      year,
      totalCount: yearBuckets.reduce((sum, bucket) => sum + bucket.count, 0),
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(
        (month) => bucketByMonth.get(month) ?? null
      ),
    };
  });
};

export const groupTenureExpiryBucketsByYear = (
  buckets: TenureExpiryMonthBucket[]
): Array<{ year: number; totalCount: number; months: Array<TenureExpiryMonthBucket | null> }> => {
  const yearSet = new Set(buckets.map((bucket) => bucket.year));
  const years = [...yearSet].sort((a, b) => a - b);

  return years.map((year) => {
    const yearBuckets = buckets.filter((bucket) => bucket.year === year);
    const bucketByMonth = new Map(
      yearBuckets.map((bucket) => [bucket.month, bucket])
    );
    return {
      year,
      totalCount: yearBuckets.reduce((sum, bucket) => sum + bucket.count, 0),
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(
        (month) => bucketByMonth.get(month) ?? null
      ),
    };
  });
};

export const getTenureMembersByMonthKey = (
  statuses: TenureStatus[],
  monthKey: string
): TenureStatus[] => {
  const parsed = parseTenureExpiryMonthKey(monthKey);
  if (!parsed) return [];

  return statuses
    .filter(
      (status) =>
        status.expiryDate &&
        status.expiryDate.getFullYear() === parsed.year &&
        status.expiryDate.getMonth() + 1 === parsed.month
    )
    .sort(compareTenureRemainingDays);
};

export const groupTenureMembersByExpiryDate = (
  statuses: TenureStatus[]
): TenureExpiryDateGroup[] => {
  const grouped = new Map<string, TenureStatus[]>();

  statuses.forEach((status) => {
    if (!status.expiryDate) return;
    const key = formatDateIso(status.expiryDate);
    const list = grouped.get(key) ?? [];
    list.push(status);
    grouped.set(key, list);
  });

  return [...grouped.entries()]
    .map(([key, members]) => {
      const date = members[0]!.expiryDate!;
      return {
        key,
        label: formatDateDot(date),
        date,
        members: [...members].sort(compareTenureRemainingDays),
      };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
};
