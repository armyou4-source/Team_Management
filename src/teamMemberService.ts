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
}

export interface DashboardEmployee {
  id: string;
  displayId: string;
  name: string;
  position: string;
  department: string;
  birthDate: string | null;
  category: string | null;
  hireDate: string | null;
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
  department: row.소속 || '미지정',
  birthDate: row.생년월일 ?? null,
  category: row.구분 ?? null,
  hireDate: row.입사일 ?? null,
  source: 'db',
};
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
