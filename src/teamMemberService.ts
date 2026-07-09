import { supabase } from './supabaseClient';

export interface TeamMemberRow {
  사번: string;
  성명: string;
  직급: string | null;
  직위: string | null;
  소속: string;
  생년월일: string | null;
  구분: string | null;
  입사일: string | null;
  transfer_date: string | null;
}

export interface DashboardEmployee {
  id: string;
  displayId: string;
  name: string;
  position: string;
  grade: string | null;
  jobTitle: string | null;
  department: string;
  birthDate: string | null;
  category: string | null;
  hireDate: string | null;
  transferDate: string | null;
  source: 'db';
}

export interface TeamMemberEmployee {
  id: string;
  name: string;
  position: string;
  department: string;
}

export const POSITION_RANK_ORDER = [
  '국장',
  '부장',
  '차장',
  '사원',
  '계약직',
  '파견직',
] as const;

export const compareByPositionRank = (positionA: string, positionB: string): number => {
  const rankA = POSITION_RANK_ORDER.indexOf(positionA as (typeof POSITION_RANK_ORDER)[number]);
  const rankB = POSITION_RANK_ORDER.indexOf(positionB as (typeof POSITION_RANK_ORDER)[number]);
  const orderA = rankA === -1 ? POSITION_RANK_ORDER.length : rankA;
  const orderB = rankB === -1 ? POSITION_RANK_ORDER.length : rankB;
  if (orderA !== orderB) return orderA - orderB;
  return positionA.localeCompare(positionB, 'ko');
};

/** 사번 앞 2자리(YY)를 입사연도로 변환. 예: 970765→1997, 010498→2001 */
export const parseHireYearFromEmployeeId = (employeeId: string): number => {
  const normalized = String(employeeId).trim();
  const prefix = parseInt(normalized.slice(0, 2), 10);
  if (Number.isNaN(prefix)) return Number.MAX_SAFE_INTEGER;
  return prefix >= 50 ? 1900 + prefix : 2000 + prefix;
};

/** 직급이 같을 때 입사연도 빠른 순 → 같은 연도면 사번 높은 순 */
export const compareByHireYearAndEmployeeId = (idA: string, idB: string): number => {
  const yearA = parseHireYearFromEmployeeId(idA);
  const yearB = parseHireYearFromEmployeeId(idB);
  if (yearA !== yearB) return yearA - yearB;

  const numA = parseInt(idA, 10);
  const numB = parseInt(idB, 10);
  if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) {
    return numB - numA;
  }

  return idB.localeCompare(idA, 'ko');
};

export const sortEmployeesByPositionAndEmployeeId = <T extends TeamMemberEmployee>(
  employees: T[]
): T[] =>
  [...employees].sort((a, b) => {
    const posCompare = compareByPositionRank(a.position, b.position);
    if (posCompare !== 0) return posCompare;
    return compareByHireYearAndEmployeeId(a.id, b.id);
  });

export const compareByAge = (
  birthDateA: string | null | undefined,
  birthDateB: string | null | undefined,
  referenceDate: Date
): number => {
  const dateA = parseBirthDate(birthDateA);
  const dateB = parseBirthDate(birthDateB);

  if (!dateA && !dateB) return 0;
  if (!dateA) return 1;
  if (!dateB) return -1;

  const ageA = calculateAge(dateA, referenceDate);
  const ageB = calculateAge(dateB, referenceDate);

  if (ageA !== ageB) return ageB - ageA;

  return dateA.getTime() - dateB.getTime();
};

export const sortEmployeesByPositionAndAge = <
  T extends TeamMemberEmployee & { birthDate: string | null },
>(
  employees: T[],
  referenceDate: Date
): T[] =>
  [...employees].sort((a, b) => {
    const posCompare = compareByPositionRank(a.position, b.position);
    if (posCompare !== 0) return posCompare;
    const ageCompare = compareByAge(a.birthDate, b.birthDate, referenceDate);
    if (ageCompare !== 0) return ageCompare;
    return compareByHireYearAndEmployeeId(a.id, b.id);
  });

export const parseBirthDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  if (/^\d{8}$/.test(trimmed)) {
    const year = parseInt(trimmed.slice(0, 4), 10);
    const month = parseInt(trimmed.slice(4, 6), 10) - 1;
    const day = parseInt(trimmed.slice(6, 8), 10);
    const date = new Date(year, month, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** referenceDate(로그인일) 기준 만 나이 */
export const calculateAge = (birthDate: Date, referenceDate: Date): number => {
  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = referenceDate.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age;
};

export const formatMemberAge = (
  birthDateValue: string | null | undefined,
  referenceDate: Date
): string => {
  const birthDate = parseBirthDate(birthDateValue);
  if (!birthDate) return '-';

  const age = calculateAge(birthDate, referenceDate);
  if (age < 0 || age > 150) return '-';

  return `${age}세`;
};

export const calculateAverageAge = (
  employees: Array<Pick<DashboardEmployee, 'birthDate'>>,
  referenceDate: Date
): number | null => {
  const ages = employees
    .map((emp) => {
      const birthDate = parseBirthDate(emp.birthDate);
      if (!birthDate) return null;
      const age = calculateAge(birthDate, referenceDate);
      return age >= 0 && age <= 150 ? age : null;
    })
    .filter((age): age is number => age !== null);

  if (ages.length === 0) return null;

  return ages.reduce((sum, age) => sum + age, 0) / ages.length;
};

export const formatAverageAge = (
  employees: Array<Pick<DashboardEmployee, 'birthDate'>>,
  referenceDate: Date
): string => {
  const average = calculateAverageAge(employees, referenceDate);
  if (average === null) return '-';
  return `${average.toFixed(1)}세`;
};

export const normalizeMemberCategory = (value: string | null | undefined): string =>
  String(value ?? '').trim();

const SIX_DIGIT_ID_CATEGORIES = new Set(['일반직', '전문직', '계약직']);

/** 표시용 사번: 일반직·전문직·계약직 6자리(0 패딩), 파견직 E+5자리(0 패딩) */
export const formatEmployeeId = (
  employeeId: string,
  category?: string | null
): string => {
  const raw = String(employeeId ?? '').trim();
  if (!raw) return raw;

  const cat = normalizeMemberCategory(category);
  const useDispatchFormat =
    cat === '파견직' || (!cat && /^E/i.test(raw));

  if (useDispatchFormat && !SIX_DIGIT_ID_CATEGORIES.has(cat)) {
    const digits = raw.replace(/^E/i, '').replace(/\D/g, '');
    if (!digits) return /^E/i.test(raw) ? raw.toUpperCase() : raw;
    return `E${digits.padStart(5, '0')}`;
  }

  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  return digits.padStart(6, '0');
};

export const AVERAGE_AGE_GROUPS = [
  {
    id: 'employee',
    label: '사원',
    categories: ['일반직', '전문직'],
  },
  {
    id: 'withContract',
    label: '계약직 포함',
    categories: ['일반직', '전문직', '계약직'],
  },
  {
    id: 'withDispatch',
    label: '파견직 포함',
    categories: ['일반직', '전문직', '계약직', '파견직'],
  },
] as const;

export const MEMBER_CATEGORY_LABELS = ['일반직', '전문직', '계약직', '파견직'] as const;

export interface MemberCategoryCountItem {
  id: (typeof MEMBER_CATEGORY_LABELS)[number];
  label: string;
  count: number;
}

export const countMembersByCategory = (
  employees: Array<Pick<DashboardEmployee, 'category'>>
): MemberCategoryCountItem[] => {
  const counts = new Map<string, number>();
  MEMBER_CATEGORY_LABELS.forEach((label) => counts.set(label, 0));

  employees.forEach((employee) => {
    const category = normalizeMemberCategory(employee.category);
    if (!MEMBER_CATEGORY_LABELS.includes(category as (typeof MEMBER_CATEGORY_LABELS)[number])) {
      return;
    }
    counts.set(category, (counts.get(category) ?? 0) + 1);
  });

  return MEMBER_CATEGORY_LABELS.map((label) => ({
    id: label,
    label,
    count: counts.get(label) ?? 0,
  }));
};

export const filterEmployeesByCategories = (
  employees: Array<Pick<DashboardEmployee, 'birthDate' | 'category'>>,
  categories: readonly string[]
): Array<Pick<DashboardEmployee, 'birthDate' | 'category'>> => {
  const allowed = new Set(categories);
  return employees.filter((emp) => allowed.has(normalizeMemberCategory(emp.category)));
};

export const calculateAverageAgeBreakdown = (
  employees: Array<Pick<DashboardEmployee, 'birthDate' | 'category'>>,
  referenceDate: Date
): Array<{ id: string; label: string; value: string; count: number }> =>
  AVERAGE_AGE_GROUPS.map((group) => {
    const filtered = filterEmployeesByCategories(employees, group.categories);
    return {
      id: group.id,
      label: group.label,
      value: formatAverageAge(filtered, referenceDate),
      count: filtered.length,
    };
  });

export const mapTeamMemberToEmployee = (row: TeamMemberRow): DashboardEmployee => {
  const id = String(row.사번);
  return {
  id,
  displayId: formatEmployeeId(id, row.구분),
  name: row.성명 || '',
  position: row.직급 || row.직위 || '사원',
  grade: row.직급 ?? null,
  jobTitle: row.직위 ?? null,
  department: row.소속 || '미지정',
  birthDate: row.생년월일 ?? null,
  category: row.구분 ?? null,
  hireDate: row.입사일 ?? null,
  transferDate: row.transfer_date ?? null,
  source: 'db',
};
};

export const toTransferDateInputValue = (value: string | null | undefined): string => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  return trimmed.slice(0, 10);
};

export const parseTransferDateParts = (
  value: string | null | undefined
): { year: number; month: number; day: number } | null => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed === '-') return null;

  let year: number;
  let month: number;
  let day: number;

  const delimited = trimmed.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (delimited) {
    year = Number(delimited[1]);
    month = Number(delimited[2]);
    day = Number(delimited[3]);
  } else if (/^\d{8}$/.test(trimmed)) {
    year = Number(trimmed.slice(0, 4));
    month = Number(trimmed.slice(4, 6));
    day = Number(trimmed.slice(6, 8));
  } else {
    const isoValue = toTransferDateInputValue(trimmed);
    const isoMatch = isoValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!isoMatch) return null;
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  }

  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
};

/** 입력값을 DB 저장용 YYYY-MM-DD 로 정규화. 빈 값은 null. 잘못된 형식이면 null 반환과 함께 invalid 플래그 용도로 Error를 throw하지 않고 호출측에서 판별 */
export const normalizeTransferDateInput = (
  value: string
): { ok: true; transferDate: string | null } | { ok: false } => {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '-') {
    return { ok: true, transferDate: null };
  }

  const parts = parseTransferDateParts(trimmed);
  if (!parts) return { ok: false };

  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return { ok: true, transferDate: `${parts.year}-${month}-${day}` };
};

export const formatTransferDate = (value: string | null | undefined): string => {
  const parts = parseTransferDateParts(value);
  if (!parts) return '-';

  return `${parts.year}.${parts.month}.${parts.day}`;
};

export const getKstDateParts = (
  referenceDate: Date
): { year: number; month: number; day: number } => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = formatter.format(referenceDate).split('-').map(Number);
  return { year, month, day };
};

/** 전입일 기준 근속기간. 대한민국 표준시(Asia/Seoul) 기준 '5년 8개월' 형식 */
export const formatTransferTenure = (
  transferDateValue: string | null | undefined,
  referenceDate: Date = new Date()
): string => {
  const transfer = parseTransferDateParts(transferDateValue);
  if (!transfer) return '';

  const now = getKstDateParts(referenceDate);
  let years = now.year - transfer.year;
  let months = now.month - transfer.month;

  if (now.day < transfer.day) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return '';

  return `${years}년 ${months}개월`;
};

export const updateTeamMemberTransferDate = async (
  employeeId: string,
  transferDate: string | null
): Promise<void> => {
  const { error } = await supabase
    .from('team_member')
    .update({ transfer_date: transferDate })
    .eq('사번', employeeId);

  if (error) {
    throw error;
  }
};

export const fetchTeamMembers = async (): Promise<DashboardEmployee[]> => {
  const { data, error } = await supabase.from('team_member').select('*');

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as TeamMemberRow[];
  return rows
    .map(mapTeamMemberToEmployee)
    .sort((a, b) => {
      const deptCompare = a.department.localeCompare(b.department, 'ko');
      if (deptCompare !== 0) return deptCompare;
      const posCompare = compareByPositionRank(a.position, b.position);
      if (posCompare !== 0) return posCompare;
      return compareByHireYearAndEmployeeId(a.id, b.id);
    });
};

export const sortDepartments = (
  departments: string[],
  leaderDepartment?: string
): string[] => {
  const unique = [...new Set(departments.filter(Boolean))];
  return unique.sort((a, b) => {
    if (leaderDepartment) {
      if (a === leaderDepartment) return -1;
      if (b === leaderDepartment) return 1;
    }
    return a.localeCompare(b, 'ko');
  });
};

export const groupEmployeesByDepartment = (
  employees: TeamMemberEmployee[],
  departmentOrder: string[]
): Array<{ department: string; members: TeamMemberEmployee[] }> => {
  const grouped = new Map<string, TeamMemberEmployee[]>();

  employees.forEach((emp) => {
    const dept = emp.department || '미지정';
    if (!grouped.has(dept)) grouped.set(dept, []);
    grouped.get(dept)!.push(emp);
  });

  const ordered = departmentOrder
    .filter((dept) => grouped.has(dept))
    .map((dept) => ({
      department: dept,
      members: sortEmployeesByPositionAndEmployeeId(grouped.get(dept)!),
    }));

  const remaining = [...grouped.keys()]
    .filter((dept) => !departmentOrder.includes(dept))
    .sort((a, b) => a.localeCompare(b, 'ko'))
    .map((dept) => ({
      department: dept,
      members: sortEmployeesByPositionAndEmployeeId(grouped.get(dept)!),
    }));

  return [...ordered, ...remaining];
};
