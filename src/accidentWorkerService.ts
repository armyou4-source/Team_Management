import { supabase } from './supabaseClient';
import { fetchTeamMembers } from './teamMemberService';
import {
  buildMemberDutyLabelsMap,
  fetchShiftMembers,
  type ShiftMemberRow,
} from './shiftService';

export interface AccidentWorkerProfile {
  memberId: string;
  name: string;
  grade: string;
  department: string;
  duties: string[];
}

type AccidentWorkerDirectoryRow = {
  member_id: string;
  name: string;
  grade: string;
  department: string;
  duties: string[] | null;
};

const FORMATTED_WORKER_LINE_PATTERN = /^.+\s+.+\s+.+_.+$/u;

export const isFormattedWorkerLine = (text: string): boolean =>
  FORMATTED_WORKER_LINE_PATTERN.test(text.trim());

export const formatAccidentWorkerLine = (profile: AccidentWorkerProfile): string => {
  const duty =
    profile.duties.length > 0 ? profile.duties.join(', ') : '-';
  return `${profile.department} ${profile.name} ${profile.grade}_${duty}`;
};

export const getCurrentWorkerSegment = (
  value: string,
  cursor: number
): { text: string; start: number; end: number } => {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  const before = value.slice(0, safeCursor);
  const segmentStart = Math.max(before.lastIndexOf('\n') + 1, before.lastIndexOf(',') + 1);
  const after = value.slice(safeCursor);
  const nextBreak = (() => {
    const newline = after.indexOf('\n');
    const comma = after.indexOf(',');
    if (newline === -1 && comma === -1) return after.length;
    if (newline === -1) return comma;
    if (comma === -1) return newline;
    return Math.min(newline, comma);
  })();
  const end = safeCursor + nextBreak;

  return {
    text: value.slice(segmentStart, end).trim(),
    start: segmentStart,
    end,
  };
};

export const replaceCurrentWorkerSegment = (
  value: string,
  cursor: number,
  replacement: string
): { text: string; selectionStart: number } => {
  const { start, end } = getCurrentWorkerSegment(value, cursor);
  const text = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
  return {
    text,
    selectionStart: start + replacement.length,
  };
};

const buildProfilesFromSources = (
  employees: Array<{
    id: string;
    name: string;
    grade: string | null;
    position: string;
    department: string;
  }>,
  shiftRows: ShiftMemberRow[]
): AccidentWorkerProfile[] => {
  const dutyMap = buildMemberDutyLabelsMap(
    shiftRows,
    employees.map((employee) => ({
      id: employee.id,
      displayId: employee.id,
    }))
  );

  return employees
    .filter((employee) => employee.name.trim())
    .map((employee) => ({
      memberId: employee.id,
      name: employee.name.trim(),
      grade: employee.grade?.trim() || employee.position.trim() || '사원',
      department: employee.department.trim() || '미지정',
      duties: dutyMap.get(employee.id) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
};

const mapDirectoryRow = (row: AccidentWorkerDirectoryRow): AccidentWorkerProfile => ({
  memberId: String(row.member_id ?? '').trim(),
  name: String(row.name ?? '').trim(),
  grade: String(row.grade ?? '').trim() || '사원',
  department: String(row.department ?? '').trim() || '미지정',
  duties: Array.isArray(row.duties)
    ? row.duties.map((duty) => String(duty ?? '').trim()).filter(Boolean)
    : [],
});

export const fetchAccidentWorkerProfiles = async (): Promise<AccidentWorkerProfile[]> => {
  const { data, error } = await supabase.rpc('get_accident_worker_directory');

  if (!error && Array.isArray(data)) {
    return (data as AccidentWorkerDirectoryRow[])
      .map(mapDirectoryRow)
      .filter((profile) => profile.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }

  try {
    const [employees, shiftRows] = await Promise.all([
      fetchTeamMembers(),
      fetchShiftMembers(),
    ]);
    return buildProfilesFromSources(employees, shiftRows);
  } catch {
    return [];
  }
};

export const searchWorkerProfiles = (
  profiles: AccidentWorkerProfile[],
  query: string
): AccidentWorkerProfile[] => {
  const normalized = query.trim();
  if (!normalized) return [];

  return profiles
    .filter((profile) => profile.name.includes(normalized))
    .sort((a, b) => {
      const aStarts = a.name.startsWith(normalized);
      const bStarts = b.name.startsWith(normalized);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return a.name.localeCompare(b.name, 'ko');
    })
    .slice(0, 8);
};

export const findWorkerProfileByName = (
  profiles: AccidentWorkerProfile[],
  name: string
): AccidentWorkerProfile | undefined => {
  const normalized = name.trim();
  if (!normalized) return undefined;

  const matches = profiles.filter((profile) => profile.name === normalized);
  return matches.length === 1 ? matches[0] : undefined;
};

export const expandWorkerSegments = (
  value: string,
  profiles: AccidentWorkerProfile[]
): string =>
  value
    .split(/(\n|,)/)
    .map((part) => {
      if (part === '\n' || part === ',') return part;

      const trimmed = part.trim();
      if (!trimmed || isFormattedWorkerLine(trimmed)) return part;

      const profile = findWorkerProfileByName(profiles, trimmed);
      if (!profile) return part;

      const formatted = formatAccidentWorkerLine(profile);
      const leading = part.match(/^\s*/)?.[0] ?? '';
      const trailing = part.match(/\s*$/)?.[0] ?? '';
      return `${leading}${formatted}${trailing}`;
    })
    .join('');

export const formatWorkerSuggestionLabel = (profile: AccidentWorkerProfile): string => {
  const duty =
    profile.duties.length > 0 ? profile.duties.join(', ') : '-';
  return `${profile.name} · ${profile.department} · ${profile.grade} · ${duty}`;
};
