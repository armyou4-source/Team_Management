import { supabase } from './supabaseClient';

export const STANDARD_SHIFT_IDS = [1, 2, 3, 4, 5, 6] as const;
export const STANDING_SHIFT_ID = 7;

export const STANDARD_SHIFT_ROLES = [
  '기술감독',
  'Video',
  'Audio',
  '녹화/회선',
  '조명',
] as const;

export const STANDING_SHIFT_ROLES = ['AR/XR', '정비', '중계', '마이크', '사무실'] as const;

export type StandardShiftRole = (typeof STANDARD_SHIFT_ROLES)[number];
export type StandingShiftRole = (typeof STANDING_SHIFT_ROLES)[number];

export interface ShiftMemberRow {
  shift_id: number;
  member_id: string;
  role: string;
}

type ShiftMemberEmployee = { id: string; displayId: string };
type ShiftRoleColumn = 'role' | '직무';

let cachedRoleColumn: ShiftRoleColumn | null = null;

export const normalizeShiftMemberId = (value: string | number | null | undefined): string =>
  String(value ?? '').trim();

export const normalizeShiftRole = (value: string | null | undefined): string =>
  String(value ?? '').trim();

const isMissingRoleColumnError = (error: { message?: string; details?: string }): boolean => {
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
  return text.includes('role') && (text.includes('column') || text.includes('does not exist'));
};

const formatShiftSaveError = (
  error: { message?: string; code?: string; details?: string; hint?: string },
  context: string
): string => {
  const code = error.code ?? '';
  const message = error.message ?? '저장에 실패했습니다.';

  if (code === '23505') {
    return `${context}: 이미 배정된 항목과 중복됩니다. (${message})`;
  }

  if (code === '23503') {
    return `${context}: 사번(member_id)이 team_member 테이블과 일치하지 않습니다. (${message})`;
  }

  if (code === '42501') {
    return `${context}: shift_members 테이블 권한(RLS)이 없습니다. 팀장 계정에 INSERT/DELETE 권한을 추가해 주세요.`;
  }

  return `${context}: ${message}`;
};

const detectRoleColumn = (record: Record<string, unknown>): ShiftRoleColumn => {
  if ('role' in record) return 'role';
  if ('직무' in record) return '직무';
  return 'role';
};

const getRoleColumn = (): ShiftRoleColumn => cachedRoleColumn ?? 'role';

const rememberRoleColumn = (record: Record<string, unknown>): void => {
  cachedRoleColumn = detectRoleColumn(record);
};

const buildShiftMemberInsertPayload = (
  shiftId: number,
  role: string,
  memberId: string,
  roleColumn: ShiftRoleColumn
): Record<string, string | number> => ({
  shift_id: shiftId,
  member_id: memberId,
  [roleColumn]: role,
});

const deleteShiftMembers = async (
  shiftId: number,
  role: string,
  roleColumn: ShiftRoleColumn = getRoleColumn()
) => {
  let result = await supabase
    .from('shift_members')
    .delete()
    .eq('shift_id', shiftId)
    .eq(roleColumn, role);

  if (result.error && roleColumn === 'role' && isMissingRoleColumnError(result.error)) {
    cachedRoleColumn = '직무';
    result = await supabase
      .from('shift_members')
      .delete()
      .eq('shift_id', shiftId)
      .eq('직무', role);
  }

  return result;
};

const getUpsertConflictTarget = (roleColumn: ShiftRoleColumn): string =>
  roleColumn === '직무' ? 'shift_id,직무,member_id' : 'shift_id,role,member_id';

const upsertShiftMembers = async (
  shiftId: number,
  role: string,
  memberIds: string[],
  roleColumn: ShiftRoleColumn = getRoleColumn()
) => {
  if (memberIds.length === 0) {
    return { data: null, error: null };
  }

  const rows = memberIds.map((memberId) =>
    buildShiftMemberInsertPayload(shiftId, role, memberId, roleColumn)
  );

  let result = await supabase
    .from('shift_members')
    .upsert(rows, { onConflict: getUpsertConflictTarget(roleColumn) });

  if (result.error && roleColumn === 'role' && isMissingRoleColumnError(result.error)) {
    cachedRoleColumn = '직무';
    const dutyRows = memberIds.map((memberId) =>
      buildShiftMemberInsertPayload(shiftId, role, memberId, '직무')
    );
    result = await supabase
      .from('shift_members')
      .upsert(dutyRows, { onConflict: getUpsertConflictTarget('직무') });
  }

  return result;
};

export const findEmployeeByMemberId = (
  employees: ShiftMemberEmployee[],
  memberId: string | number | null | undefined
): ShiftMemberEmployee | undefined => {
  const normalized = normalizeShiftMemberId(memberId);
  if (!normalized) return undefined;

  const exact = employees.find(
    (employee) => employee.id === normalized || employee.displayId === normalized
  );
  if (exact) return exact;

  const targetDigits = normalized.replace(/^E/i, '').replace(/\D/g, '');
  if (!targetDigits) return undefined;

  return employees.find((employee) => {
    const idDigits = employee.id.replace(/^E/i, '').replace(/\D/g, '');
    const displayDigits = employee.displayId.replace(/^E/i, '').replace(/\D/g, '');
    return (
      idDigits === targetDigits ||
      displayDigits === targetDigits ||
      idDigits.padStart(6, '0') === targetDigits.padStart(6, '0') ||
      displayDigits.padStart(6, '0') === targetDigits.padStart(6, '0')
    );
  });
};

export const resolveShiftMemberId = (
  employees: ShiftMemberEmployee[],
  memberId: string | number | null | undefined
): string => findEmployeeByMemberId(employees, memberId)?.id ?? normalizeShiftMemberId(memberId);

export const resolvePersistedMemberId = (
  employees: ShiftMemberEmployee[],
  memberId: string
): string => resolveShiftMemberId(employees, memberId);

const uniqueMemberIds = (memberIds: string[], employees: ShiftMemberEmployee[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  memberIds.forEach((memberId) => {
    const persistedId = resolvePersistedMemberId(employees, memberId);
    if (!persistedId || seen.has(persistedId)) return;
    seen.add(persistedId);
    result.push(persistedId);
  });

  return result;
};

export interface ShiftAssignmentState {
  standard: Record<string, string>;
  standing: Record<string, string[]>;
}

export const getShiftLabel = (shiftId: number): string => {
  if (shiftId >= 1 && shiftId <= 6) return `${shiftId}조`;
  if (shiftId === STANDING_SHIFT_ID) return '상시/기타';
  return `${shiftId}조`;
};

export const buildStandardAssignmentKey = (shiftId: number, role: string): string =>
  `${shiftId}:${role}`;

export const buildStandingAssignmentKey = (role: string): string =>
  `${STANDING_SHIFT_ID}:${role}`;

export const buildEmptyAssignmentState = (): ShiftAssignmentState => {
  const standard: Record<string, string> = {};
  STANDARD_SHIFT_IDS.forEach((shiftId) => {
    STANDARD_SHIFT_ROLES.forEach((role) => {
      standard[buildStandardAssignmentKey(shiftId, role)] = '';
    });
  });

  const standing: Record<string, string[]> = {};
  STANDING_SHIFT_ROLES.forEach((role) => {
    standing[buildStandingAssignmentKey(role)] = [];
  });

  return { standard, standing };
};

export const mapShiftMembersToAssignmentState = (
  rows: ShiftMemberRow[],
  employees: ShiftMemberEmployee[] = []
): ShiftAssignmentState => {
  const state = buildEmptyAssignmentState();

  rows.forEach((row) => {
    const shiftId = Number(row.shift_id);
    const role = normalizeShiftRole(row.role);
    const memberId = resolveShiftMemberId(employees, row.member_id);
    if (!role || !memberId) return;

    if (shiftId === STANDING_SHIFT_ID) {
      const standingRole = STANDING_SHIFT_ROLES.find((item) => item === role);
      if (!standingRole) return;
      const key = buildStandingAssignmentKey(standingRole);
      if (!state.standing[key].includes(memberId)) {
        state.standing[key].push(memberId);
      }
      return;
    }

    const standardRole = STANDARD_SHIFT_ROLES.find((item) => item === role);
    if (!standardRole) return;

    const key = buildStandardAssignmentKey(shiftId, standardRole);
    if (key in state.standard) {
      state.standard[key] = memberId;
    }
  });

  return state;
};

export const fetchShiftMembers = async (): Promise<ShiftMemberRow[]> => {
  const shiftIds = [...STANDARD_SHIFT_IDS, STANDING_SHIFT_ID];
  const { data, error } = await supabase
    .from('shift_members')
    .select('*')
    .in('shift_id', shiftIds);

  if (error) throw error;

  if (data && data.length > 0) {
    rememberRoleColumn(data[0] as Record<string, unknown>);
  }

  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    return {
      shift_id: Number(record.shift_id),
      member_id: normalizeShiftMemberId(record.member_id as string | number),
      role: normalizeShiftRole(
        (record.role as string | undefined) ?? (record.직무 as string | undefined)
      ),
    };
  });
};

export const saveStandardAssignments = async (
  standard: ShiftAssignmentState['standard'],
  employees: ShiftMemberEmployee[] = []
): Promise<void> => {
  for (const shiftId of STANDARD_SHIFT_IDS) {
    for (const role of STANDARD_SHIFT_ROLES) {
      const key = buildStandardAssignmentKey(shiftId, role);
      const memberId = standard[key] ?? '';

      const { error: deleteError } = await deleteShiftMembers(shiftId, role);
      if (deleteError) {
        throw new Error(formatShiftSaveError(deleteError, `${getShiftLabel(shiftId)} ${role} 삭제`));
      }

      if (!memberId) continue;

      const persistedId = resolvePersistedMemberId(employees, memberId);
      const { error: upsertError } = await upsertShiftMembers(shiftId, role, [persistedId]);
      if (upsertError) {
        throw new Error(formatShiftSaveError(upsertError, `${getShiftLabel(shiftId)} ${role} 저장`));
      }
    }
  }
};

export const saveStandingAssignments = async (
  standing: ShiftAssignmentState['standing'],
  employees: ShiftMemberEmployee[] = []
): Promise<void> => {
  for (const role of STANDING_SHIFT_ROLES) {
    const key = buildStandingAssignmentKey(role);
    const memberIds = uniqueMemberIds(standing[key] ?? [], employees);

    const { error: deleteError } = await deleteShiftMembers(STANDING_SHIFT_ID, role);
    if (deleteError) {
      throw new Error(formatShiftSaveError(deleteError, `상시 직무 ${role} 삭제`));
    }

    if (memberIds.length === 0) continue;

    const { error: upsertError } = await upsertShiftMembers(
      STANDING_SHIFT_ID,
      role,
      memberIds
    );
    if (upsertError) {
      throw new Error(formatShiftSaveError(upsertError, `상시 직무 ${role} 저장`));
    }
  }
};

export const saveShiftAssignmentState = async (
  state: ShiftAssignmentState,
  employees: ShiftMemberEmployee[] = []
): Promise<void> => {
  await saveStandardAssignments(state.standard, employees);
  await saveStandingAssignments(state.standing, employees);
};

const sortDutyLabels = (labels: string[]): string[] =>
  [...labels].sort((a, b) => a.localeCompare(b, 'ko'));

export const buildMemberDutyLabelsMap = (
  rows: ShiftMemberRow[],
  employees: ShiftMemberEmployee[] = []
): Map<string, string[]> => {
  const map = new Map<string, string[]>();

  rows.forEach((row) => {
    const role = normalizeShiftRole(row.role);
    const memberId = resolveShiftMemberId(employees, row.member_id);
    if (!role || !memberId) return;

    const current = map.get(memberId) ?? [];
    if (!current.includes(role)) {
      map.set(memberId, [...current, role]);
    }
  });

  map.forEach((labels, memberId) => {
    map.set(memberId, sortDutyLabels(labels));
  });

  return map;
};

export const getMemberDutyLabel = (
  memberId: string,
  dutyLabelsMap: Map<string, string[]>
): string => {
  const labels = dutyLabelsMap.get(memberId);
  return labels && labels.length > 0 ? labels.join(', ') : '-';
};
