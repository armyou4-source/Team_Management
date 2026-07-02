import { supabase } from './supabaseClient';
import type { DashboardEmployee } from './teamMemberService';
import { sortEmployeesByPositionAndEmployeeId } from './teamMemberService';

export interface DepartmentRow {
  id: string;
  parent_id: string | null;
}

export interface DepartmentNode {
  id: string;
  parentId: string | null;
  children: DepartmentNode[];
}

export const fetchDepartments = async (): Promise<DepartmentRow[]> => {
  const { data, error } = await supabase.from('departments').select('id, parent_id');

  if (error) {
    throw error;
  }

  return (data ?? []) as DepartmentRow[];
};

export const getVisibleDepartmentIds = (
  departments: DepartmentRow[],
  rootDepartmentId: string
): Set<string> => {
  const visible = new Set<string>([rootDepartmentId]);
  let changed = true;

  while (changed) {
    changed = false;
    departments.forEach((dept) => {
      if (dept.parent_id && visible.has(dept.parent_id) && !visible.has(dept.id)) {
        visible.add(dept.id);
        changed = true;
      }
    });
  }

  return visible;
};

export const buildDepartmentTree = (
  departments: DepartmentRow[],
  rootDepartmentId: string
): DepartmentNode[] => {
  const visibleIds = getVisibleDepartmentIds(departments, rootDepartmentId);
  const visibleDepartments = departments.filter((dept) => visibleIds.has(dept.id));
  const childrenByParent = new Map<string, DepartmentRow[]>();

  visibleDepartments.forEach((dept) => {
    if (!dept.parent_id || !visibleIds.has(dept.parent_id)) return;
    if (!childrenByParent.has(dept.parent_id)) {
      childrenByParent.set(dept.parent_id, []);
    }
    childrenByParent.get(dept.parent_id)!.push(dept);
  });

  const buildNode = (dept: DepartmentRow): DepartmentNode => {
    const children = (childrenByParent.get(dept.id) ?? [])
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id, 'ko'))
      .map(buildNode);

    return {
      id: dept.id,
      parentId: dept.parent_id,
      children,
    };
  };

  const root = visibleDepartments.find((dept) => dept.id === rootDepartmentId);
  if (!root) {
    return [
      {
        id: rootDepartmentId,
        parentId: null,
        children: [],
      },
    ];
  }

  return [buildNode(root)];
};

export const flattenDepartmentTree = (nodes: DepartmentNode[]): DepartmentNode[] => {
  const result: DepartmentNode[] = [];

  const walk = (node: DepartmentNode) => {
    result.push(node);
    node.children.forEach(walk);
  };

  nodes.forEach(walk);
  return result;
};

export const countMembersByDepartment = (
  employees: DashboardEmployee[]
): Record<string, number> => {
  const counts: Record<string, number> = {};

  employees.forEach((emp) => {
    const dept = emp.department || '미지정';
    counts[dept] = (counts[dept] ?? 0) + 1;
  });

  return counts;
};

export const getMembersInDepartment = (
  employees: DashboardEmployee[],
  departmentId: string
): DashboardEmployee[] =>
  sortEmployeesByPositionAndEmployeeId(
    employees.filter((emp) => emp.department === departmentId)
  );

export const findDepartmentParent = (
  departments: DepartmentRow[],
  departmentId: string
): string | null => departments.find((dept) => dept.id === departmentId)?.parent_id ?? null;

export interface DepartmentMemberCountItem {
  id: string;
  count: number;
  isRootTeam: boolean;
}

/** 본인 팀 + 직속 하위 파트별 인원 */
export const getDepartmentMemberBreakdown = (
  departmentTree: DepartmentNode[],
  memberCounts: Record<string, number>
): DepartmentMemberCountItem[] => {
  const root = departmentTree[0];
  if (!root) return [];

  return [
    { id: root.id, count: memberCounts[root.id] ?? 0, isRootTeam: true },
    ...root.children.map((child) => ({
      id: child.id,
      count: memberCounts[child.id] ?? 0,
      isRootTeam: false,
    })),
  ];
};
