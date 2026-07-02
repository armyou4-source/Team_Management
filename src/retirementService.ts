import type { DashboardEmployee } from './teamMemberService';
import {
  calculateAge,
  normalizeMemberCategory,
  parseBirthDate,
} from './teamMemberService';
import {
  addDays,
  addYears,
  diffDays,
  formatDateIso,
  formatDateDot,
  startOfDay,
  subtractDays,
  subtractMonths,
} from './contractTenureService';

export const RETIREMENT_AGE = 60;
export const SABBATICAL_MONTHS_BEFORE_RETIREMENT = 12;
export const GREEN_PLAN_WEEKS_BEFORE_SABBATICAL = 12;
export const GREEN_PLAN_HORIZON_YEARS = 5;

export type RetirementCohort =
  | 'in_green_plan'
  | 'in_sabbatical'
  | 'before_green_plan_1y'
  | 'before_green_plan_2y'
  | 'before_green_plan_3y'
  | 'before_green_plan_4y'
  | 'before_green_plan_5y'
  | 'beyond_green_plan_5y'
  | 'retired'
  | 'unknown_birth_date';

export interface RetirementStatus {
  employee: DashboardEmployee;
  birthDate: Date | null;
  sixtiethBirthday: Date | null;
  retirementDate: Date | null;
  retirementQuarterLabel: string | null;
  sabbaticalStartDate: Date | null;
  greenPlanStartDate: Date | null;
  currentAge: number | null;
  daysUntilGreenPlan: number | null;
  daysUntilSabbatical: number | null;
  daysUntilRetirement: number | null;
  daysInGreenPlan: number | null;
  cohort: RetirementCohort;
}

export interface RetirementCohortGroup {
  id: RetirementCohortDisplayId;
  label: string;
  description: string;
  members: RetirementStatus[];
}

export interface GreenPlanQuarterBucket {
  key: string;
  year: number;
  quarter: number;
  label: string;
  count: number;
  members: RetirementStatus[];
}

export interface GreenPlanStartDateGroup {
  key: string;
  label: string;
  date: Date;
  members: RetirementStatus[];
}

export const RETIREMENT_TARGET_CATEGORIES = ['일반직', '전문직', '계약직'] as const;

export const isRetirementTargetEmployee = (
  employee: Pick<DashboardEmployee, 'category'>
): boolean =>
  RETIREMENT_TARGET_CATEGORIES.includes(
    normalizeMemberCategory(employee.category) as (typeof RETIREMENT_TARGET_CATEGORIES)[number]
  );

/** 해당 날짜가 속한 분기의 마지막 날 */
export const getQuarterEndDate = (date: Date): Date => {
  const normalized = startOfDay(date);
  const quarterEndMonth = Math.floor(normalized.getMonth() / 3) * 3 + 2;
  return startOfDay(new Date(normalized.getFullYear(), quarterEndMonth + 1, 0));
};

export const getQuarterFromDate = (date: Date): number =>
  Math.floor(date.getMonth() / 3) + 1;

export const getQuarterLabel = (date: Date): string => {
  const quarter = getQuarterFromDate(date);
  return `${date.getFullYear()}년 ${quarter}분기`;
};

export const getGreenPlanStartQuarterKey = (date: Date): string => {
  const year = date.getFullYear();
  const quarter = getQuarterFromDate(date);
  return `${year}-Q${quarter}`;
};

export const calculateSixtiethBirthday = (birthDate: Date): Date =>
  startOfDay(addYears(birthDate, RETIREMENT_AGE));

/** 만 60세가 되는 분기 말일 = 정년퇴직일 */
export const calculateRetirementDate = (birthDate: Date): Date =>
  getQuarterEndDate(calculateSixtiethBirthday(birthDate));

/** 정년퇴직 1년 전 = 안식년 시작일 */
export const calculateSabbaticalStartDate = (retirementDate: Date): Date =>
  startOfDay(subtractMonths(retirementDate, SABBATICAL_MONTHS_BEFORE_RETIREMENT));

/** 안식년 12주 전 + 1일 = 그린플랜 시작일 (만 나이 기준, 분기말 안식년은 고정 월·일 적용) */
const GREEN_PLAN_ANCHOR_REFERENCE_YEAR = 2025;

const computeGreenPlanAnchorForQuarter = (
  quarter: number
): { month: number; day: number } => {
  const quarterEndMonth = quarter * 3 - 1;
  const sabbatical = startOfDay(
    new Date(GREEN_PLAN_ANCHOR_REFERENCE_YEAR, quarterEndMonth + 1, 0)
  );
  const adjusted = addDays(
    subtractDays(sabbatical, GREEN_PLAN_WEEKS_BEFORE_SABBATICAL * 7),
    1
  );
  return { month: adjusted.getMonth(), day: adjusted.getDate() };
};

const GREEN_PLAN_START_ANCHORS: Record<number, { month: number; day: number }> = {
  1: computeGreenPlanAnchorForQuarter(1),
  2: computeGreenPlanAnchorForQuarter(2),
  3: computeGreenPlanAnchorForQuarter(3),
  4: computeGreenPlanAnchorForQuarter(4),
};

const getQuarterFromQuarterEnd = (date: Date): number | null => {
  const normalized = startOfDay(date);
  const month = normalized.getMonth();
  const day = normalized.getDate();
  const lastDayOfMonth = new Date(normalized.getFullYear(), month + 1, 0).getDate();
  if (day !== lastDayOfMonth) return null;

  if (month === 2) return 1;
  if (month === 5) return 2;
  if (month === 8) return 3;
  if (month === 11) return 4;
  return null;
};

export const calculateGreenPlanStartDate = (sabbaticalStartDate: Date): Date => {
  const sabbatical = startOfDay(sabbaticalStartDate);
  const quarter = getQuarterFromQuarterEnd(sabbatical);

  if (quarter !== null) {
    const anchor = GREEN_PLAN_START_ANCHORS[quarter]!;
    return startOfDay(new Date(sabbatical.getFullYear(), anchor.month, anchor.day));
  }

  return startOfDay(
    addDays(subtractDays(sabbatical, GREEN_PLAN_WEEKS_BEFORE_SABBATICAL * 7), 1)
  );
};

const diffMonthsBetween = (from: Date, to: Date): number => {
  const start = startOfDay(from);
  const end = startOfDay(to);
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return months;
};

export const assignRetirementCohort = (
  referenceDate: Date,
  greenPlanStartDate: Date,
  sabbaticalStartDate: Date,
  retirementDate: Date
): RetirementCohort => {
  const ref = startOfDay(referenceDate);

  if (ref > retirementDate) return 'retired';
  if (ref >= sabbaticalStartDate) return 'in_sabbatical';
  if (ref >= greenPlanStartDate) return 'in_green_plan';

  const monthsUntilGreenPlan = diffMonthsBetween(ref, greenPlanStartDate);
  if (monthsUntilGreenPlan <= 12) return 'before_green_plan_1y';
  if (monthsUntilGreenPlan <= 24) return 'before_green_plan_2y';
  if (monthsUntilGreenPlan <= 36) return 'before_green_plan_3y';
  if (monthsUntilGreenPlan <= 48) return 'before_green_plan_4y';
  if (monthsUntilGreenPlan <= GREEN_PLAN_HORIZON_YEARS * 12) return 'before_green_plan_5y';

  return 'beyond_green_plan_5y';
};

export const buildRetirementStatus = (
  employee: DashboardEmployee,
  referenceDate: Date
): RetirementStatus => {
  const birthDate = parseBirthDate(employee.birthDate);
  const ref = startOfDay(referenceDate);

  if (!birthDate) {
    return {
      employee,
      birthDate: null,
      sixtiethBirthday: null,
      retirementDate: null,
      retirementQuarterLabel: null,
      sabbaticalStartDate: null,
      greenPlanStartDate: null,
      currentAge: null,
      daysUntilGreenPlan: null,
      daysUntilSabbatical: null,
      daysUntilRetirement: null,
      daysInGreenPlan: null,
      cohort: 'unknown_birth_date',
    };
  }

  const normalizedBirthDate = startOfDay(birthDate);
  const sixtiethBirthday = calculateSixtiethBirthday(normalizedBirthDate);
  const retirementDate = calculateRetirementDate(normalizedBirthDate);
  const sabbaticalStartDate = calculateSabbaticalStartDate(retirementDate);
  const greenPlanStartDate = calculateGreenPlanStartDate(sabbaticalStartDate);
  const cohort = assignRetirementCohort(ref, greenPlanStartDate, sabbaticalStartDate, retirementDate);

  return {
    employee,
    birthDate: normalizedBirthDate,
    sixtiethBirthday,
    retirementDate,
    retirementQuarterLabel: getQuarterLabel(sixtiethBirthday),
    sabbaticalStartDate,
    greenPlanStartDate,
    currentAge: calculateAge(normalizedBirthDate, ref),
    daysUntilGreenPlan: diffDays(ref, greenPlanStartDate),
    daysUntilSabbatical: diffDays(ref, sabbaticalStartDate),
    daysUntilRetirement: diffDays(ref, retirementDate),
    daysInGreenPlan:
      ref >= greenPlanStartDate && ref < sabbaticalStartDate
        ? diffDays(greenPlanStartDate, ref) + 1
        : null,
    cohort,
  };
};

const COHORT_DISPLAY_ORDER = [
  'in_green_plan',
  'in_sabbatical',
  'before_green_plan_1y',
  'before_green_plan_2y',
  'before_green_plan_3y',
  'before_green_plan_4y',
  'before_green_plan_5y',
] as const;

type RetirementCohortDisplayId = (typeof COHORT_DISPLAY_ORDER)[number];

const COHORT_META: Record<
  RetirementCohortDisplayId,
  { label: string; description: string }
> = {
  in_green_plan: {
    label: '그린플랜 해당',
    description: '안식년 12주 전부터 안식년 시작 전까지 그린플랜 기간입니다.',
  },
  in_sabbatical: {
    label: '안식년 해당',
    description: '정년퇴직 1년 전부터 정년퇴직일까지 안식년 기간입니다.',
  },
  before_green_plan_1y: {
    label: '그린플랜 1년 전',
    description: '그린플랜 시작까지 1년 이내입니다.',
  },
  before_green_plan_2y: {
    label: '그린플랜 2년 전',
    description: '그린플랜 시작까지 1~2년 남았습니다.',
  },
  before_green_plan_3y: {
    label: '그린플랜 3년 전',
    description: '그린플랜 시작까지 2~3년 남았습니다.',
  },
  before_green_plan_4y: {
    label: '그린플랜 4년 전',
    description: '그린플랜 시작까지 3~4년 남았습니다.',
  },
  before_green_plan_5y: {
    label: '그린플랜 5년 전',
    description: '그린플랜 시작까지 4~5년 남았습니다.',
  },
};

const compareRetirementStatus = (a: RetirementStatus, b: RetirementStatus): number => {
  const dateA = a.greenPlanStartDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const dateB = b.greenPlanStartDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (dateA !== dateB) return dateA - dateB;
  return a.employee.name.localeCompare(b.employee.name, 'ko');
};

const GREEN_PLAN_CATEGORY_ORDER = ['일반직', '전문직', '계약직'] as const;

const compareGreenPlanMember = (a: RetirementStatus, b: RetirementStatus): number => {
  const catA = normalizeMemberCategory(a.employee.category);
  const catB = normalizeMemberCategory(b.employee.category);
  const rankA = GREEN_PLAN_CATEGORY_ORDER.indexOf(
    catA as (typeof GREEN_PLAN_CATEGORY_ORDER)[number]
  );
  const rankB = GREEN_PLAN_CATEGORY_ORDER.indexOf(
    catB as (typeof GREEN_PLAN_CATEGORY_ORDER)[number]
  );
  const orderA = rankA === -1 ? GREEN_PLAN_CATEGORY_ORDER.length : rankA;
  const orderB = rankB === -1 ? GREEN_PLAN_CATEGORY_ORDER.length : rankB;
  if (orderA !== orderB) return orderA - orderB;
  return compareRetirementStatus(a, b);
};

const isVisibleRetirementCohort = (cohort: RetirementCohort): boolean =>
  cohort !== 'retired' &&
  cohort !== 'unknown_birth_date' &&
  cohort !== 'beyond_green_plan_5y';

export const buildRetirementStatuses = (
  employees: DashboardEmployee[],
  referenceDate: Date
): RetirementStatus[] =>
  employees
    .filter(isRetirementTargetEmployee)
    .map((employee) => buildRetirementStatus(employee, referenceDate))
    .filter((item) => isVisibleRetirementCohort(item.cohort))
    .sort(compareRetirementStatus);

/** 그린플랜 시작 분기 그래프용 — 5년 초과 대상자 포함 */
export const buildRetirementStatusesForChart = (
  employees: DashboardEmployee[],
  referenceDate: Date
): RetirementStatus[] =>
  employees
    .filter(isRetirementTargetEmployee)
    .map((employee) => buildRetirementStatus(employee, referenceDate))
    .filter((item) => item.cohort !== 'retired' && item.cohort !== 'unknown_birth_date')
    .sort(compareRetirementStatus);

export const buildRetirementCohortGroups = (
  statuses: RetirementStatus[]
): RetirementCohortGroup[] =>
  COHORT_DISPLAY_ORDER.map((cohortId) => {
    const meta = COHORT_META[cohortId];
    return {
      id: cohortId,
      label: meta.label,
      description: meta.description,
      members: statuses.filter((item) => item.cohort === cohortId).sort(compareRetirementStatus),
    };
  });

export const buildGreenPlanQuarterBuckets = (
  statuses: RetirementStatus[]
): GreenPlanQuarterBucket[] => {
  const grouped = new Map<string, RetirementStatus[]>();

  statuses.forEach((status) => {
    if (!status.greenPlanStartDate) return;
    const key = getGreenPlanStartQuarterKey(status.greenPlanStartDate);
    const list = grouped.get(key) ?? [];
    list.push(status);
    grouped.set(key, list);
  });

  return [...grouped.entries()]
    .map(([key, members]) => {
      const sortedMembers = [...members].sort(compareRetirementStatus);
      const sampleDate = sortedMembers[0]!.greenPlanStartDate!;
      const year = sampleDate.getFullYear();
      const quarter = getQuarterFromDate(sampleDate);
      return {
        key,
        year,
        quarter,
        label: `${year}년 ${quarter}분기`,
        count: sortedMembers.length,
        members: sortedMembers,
      };
    })
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.quarter - b.quarter;
    });
};

export const groupGreenPlanBucketsByYear = (
  buckets: GreenPlanQuarterBucket[]
): Array<{ year: number; totalCount: number; quarters: Array<GreenPlanQuarterBucket | null> }> => {
  const yearSet = new Set(buckets.map((bucket) => bucket.year));
  const years = [...yearSet].sort((a, b) => a - b);

  return years.map((year) => {
    const yearBuckets = buckets.filter((bucket) => bucket.year === year);
    const bucketByQuarter = new Map(
      yearBuckets.map((bucket) => [bucket.quarter, bucket])
    );
    return {
      year,
      totalCount: yearBuckets.reduce((sum, bucket) => sum + bucket.count, 0),
      quarters: [1, 2, 3, 4].map((quarter) => bucketByQuarter.get(quarter) ?? null),
    };
  });
};

export const getGreenPlanMembersByYear = (
  statuses: RetirementStatus[],
  year: number
): RetirementStatus[] =>
  statuses
    .filter(
      (status) => status.greenPlanStartDate && status.greenPlanStartDate.getFullYear() === year
    )
    .sort(compareRetirementStatus);

export const groupGreenPlanMembersByStartDate = (
  statuses: RetirementStatus[]
): GreenPlanStartDateGroup[] => {
  const grouped = new Map<string, RetirementStatus[]>();

  statuses.forEach((status) => {
    if (!status.greenPlanStartDate) return;
    const key = formatDateIso(status.greenPlanStartDate);
    const list = grouped.get(key) ?? [];
    list.push(status);
    grouped.set(key, list);
  });

  return [...grouped.entries()]
    .map(([key, members]) => {
      const date = members[0]!.greenPlanStartDate!;
      return {
        key,
        label: formatDateDot(date),
        date,
        members: [...members].sort(compareGreenPlanMember),
      };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
};

export const getRetirementTimelineLabel = (status: RetirementStatus): string => {
  if (status.cohort === 'in_sabbatical') {
    if (status.daysUntilRetirement === null) return '-';
    if (status.daysUntilRetirement < 0) return '정년퇴직일 경과';
    if (status.daysUntilRetirement === 0) return '오늘 정년퇴직';
    return `정년 D-${status.daysUntilRetirement}`;
  }

  if (status.cohort === 'in_green_plan') {
    if (status.daysUntilSabbatical === null) return '-';
    if (status.daysUntilSabbatical <= 0) return '안식년 시작';
    return `안식년 D-${status.daysUntilSabbatical}`;
  }

  if (status.daysUntilGreenPlan === null) return '-';
  if (status.daysUntilGreenPlan <= 0) return '그린플랜 시작';
  return `그린플랜 D-${status.daysUntilGreenPlan}`;
};

export const formatRetirementRuleSummary = (): string =>
  `만 ${RETIREMENT_AGE}세 분기말 정년퇴직 · 정년 1년 전 안식년 · 안식년 ${GREEN_PLAN_WEEKS_BEFORE_SABBATICAL}주 전 그린플랜`;

export const formatRetirementDetailDates = (status: RetirementStatus): string => {
  const greenPlan = status.greenPlanStartDate
    ? formatDateDot(status.greenPlanStartDate)
    : '-';
  const sabbatical = status.sabbaticalStartDate
    ? formatDateDot(status.sabbaticalStartDate)
    : '-';
  const retirement = status.retirementDate ? formatDateDot(status.retirementDate) : '-';
  return `그린플랜 ${greenPlan} · 안식년 ${sabbatical} · 정년 ${retirement}`;
};
