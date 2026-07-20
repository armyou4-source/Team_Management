import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TeamMemberProfile } from './authService';
import {
  type DepartmentNode,
  type DepartmentRow,
  buildDepartmentTree,
  countMembersByDepartment,
  fetchDepartments,
  findDepartmentParent,
  flattenDepartmentTree,
  getDepartmentMemberBreakdown,
  getMembersInDepartment,
} from './departmentService';
import {
  type TenureStatus,
  buildExpiryCalendarUrl,
  buildHrReplacementEmailUrl,
  buildReminderCalendarUrl,
  buildTenureExpiryMonthBuckets,
  buildTenureStatuses,
  formatDateDot,
  getCategoryBadgeClass,
  getCategoryBadgeLabel,
  getTenureExpiryMonthKey,
  getTenureMembersByMonthKey,
  getTenureStatusClass,
  openExternalUrl,
  parseTenureExpiryMonthKey,
} from './contractTenureService';
import {
  buildGreenPlanQuarterBuckets,
  buildRetirementStatuses,
  buildRetirementStatusesForChart,
  getGreenPlanMembersByYear,
  groupGreenPlanMembersByStartDate,
} from './retirementService';
import GreenPlanStartChart from './GreenPlanStartChart';
import ShiftAssignmentManagement from './ShiftAssignmentManagement';
import { openWorkSchedule } from './workScheduleService';
import {
  buildMemberDutyLabelsMap,
  fetchShiftMembers,
  getMemberDutyLabel,
  type ShiftMemberRow,
} from './shiftService';
import TenureExpiryChart from './TenureExpiryChart';
import LeaderPageNav, { type LeaderPage } from './LeaderPageNav';
import AccidentReportManagementPanel from './AccidentReportManagement';
import {
  type DashboardEmployee,
  calculateAverageAgeBreakdown,
  countMembersByCategory,
  fetchTeamMembers,
  formatEmployeeId,
  formatMemberAge,
  formatTransferDate,
  formatTransferTenure,
  normalizeMemberCategory,
  normalizeTransferDateInput,
  updateTeamMemberTransferDate,
} from './teamMemberService';
import './Dashboard.css';
import './DepartmentManagement.css';
import './AccidentReportManagement.css';

interface DepartmentManagementProps {
  currentUser: TeamMemberProfile;
  onLogout: () => Promise<void>;
  activePage: LeaderPage;
  onNavigate: (page: LeaderPage) => void;
  loginReferenceDate: Date;
}

type SidebarView = 'department' | 'tenure' | 'retirement' | 'shift' | 'accident';

const DEPT_SUMMARY_DEPARTMENT_IDS = new Set(['보도기술팀', '중계보도솔루션파트']);

interface DeptTreeItemProps {
  node: DepartmentNode;
  depth: number;
  selectedDeptId: string | null;
  sidebarView: SidebarView;
  memberCounts: Record<string, number>;
  onSelect: (departmentId: string) => void;
}

function DeptTreeItem({
  node,
  depth,
  selectedDeptId,
  sidebarView,
  memberCounts,
  onSelect,
}: DeptTreeItemProps) {
  const isSelected = sidebarView === 'department' && selectedDeptId === node.id;

  return (
    <>
      <button
        type="button"
        className={`dept-tree-item${isSelected ? ' selected' : ''}`}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        onClick={() => onSelect(node.id)}
      >
        <span className="dept-tree-name">{node.id}</span>
        <span className="dept-tree-count">{memberCounts[node.id] ?? 0}명</span>
      </button>
      {node.children.map((child) => (
        <DeptTreeItem
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedDeptId={selectedDeptId}
          sidebarView={sidebarView}
          memberCounts={memberCounts}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

export default function DepartmentManagement({
  currentUser,
  onLogout,
  activePage,
  onNavigate,
  loginReferenceDate,
}: DepartmentManagementProps) {
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [employees, setEmployees] = useState<DashboardEmployee[]>([]);
  const [shiftMembers, setShiftMembers] = useState<ShiftMemberRow[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [sidebarView, setSidebarView] = useState<SidebarView>('department');
  const [retirementViewActive, setRetirementViewActive] = useState(false);
  const [selectedGreenPlanYear, setSelectedGreenPlanYear] = useState<number | null>(null);
  const [selectedTenureMonthKey, setSelectedTenureMonthKey] = useState<string | null>(null);
  const [selectedTenureEmpId, setSelectedTenureEmpId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [savingTransferDateId, setSavingTransferDateId] = useState<string | null>(null);
  const [transferDateDrafts, setTransferDateDrafts] = useState<Record<string, string>>({});
  const [accidentReportCount, setAccidentReportCount] = useState<number | null>(null);

  const departmentTree = useMemo(
    () => buildDepartmentTree(departments, currentUser.소속),
    [departments, currentUser.소속]
  );

  const flatDepartments = useMemo(
    () => flattenDepartmentTree(departmentTree),
    [departmentTree]
  );

  const memberCounts = useMemo(
    () => countMembersByDepartment(employees),
    [employees]
  );

  const filteredTree = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || sidebarView === 'tenure' || retirementViewActive || sidebarView === 'shift' || sidebarView === 'accident') return departmentTree;

    const matchingIds = new Set(
      flatDepartments
        .filter((dept) => dept.id.toLowerCase().includes(query))
        .map((dept) => dept.id)
    );

    const filterNodes = (nodes: DepartmentNode[]): DepartmentNode[] =>
      nodes
        .map((node) => ({
          ...node,
          children: filterNodes(node.children),
        }))
        .filter(
          (node) =>
            matchingIds.has(node.id) ||
            node.children.length > 0
        );

    return filterNodes(departmentTree);
  }, [departmentTree, flatDepartments, searchQuery, retirementViewActive, sidebarView]);

  const selectedDept = useMemo(
    () => flatDepartments.find((dept) => dept.id === selectedDeptId) ?? null,
    [flatDepartments, selectedDeptId]
  );

  const selectedMembers = useMemo(
    () =>
      selectedDeptId
        ? getMembersInDepartment(employees, selectedDeptId, loginReferenceDate)
        : [],
    [employees, selectedDeptId, loginReferenceDate]
  );

  const tenureStatuses = useMemo(
    () => buildTenureStatuses(employees, loginReferenceDate),
    [employees, loginReferenceDate]
  );

  const tenureNeedingAction = useMemo(
    () => tenureStatuses.filter((item) => item.status === 'reminder_window' || item.status === 'expired'),
    [tenureStatuses]
  );

  const tenureExpiryMonthBuckets = useMemo(
    () => buildTenureExpiryMonthBuckets(tenureStatuses),
    [tenureStatuses]
  );

  const selectedTenureMonthMembers = useMemo(() => {
    if (!selectedTenureMonthKey) return [];
    return getTenureMembersByMonthKey(tenureStatuses, selectedTenureMonthKey);
  }, [tenureStatuses, selectedTenureMonthKey]);

  const selectedTenureMonthLabel = useMemo(() => {
    if (!selectedTenureMonthKey) return null;
    const parsed = parseTenureExpiryMonthKey(selectedTenureMonthKey);
    if (!parsed) return null;
    return `${parsed.year}년 ${parsed.month}월`;
  }, [selectedTenureMonthKey]);

  const retirementStatuses = useMemo(
    () => buildRetirementStatuses(employees, loginReferenceDate),
    [employees, loginReferenceDate]
  );

  const retirementStatusesForChart = useMemo(
    () => buildRetirementStatusesForChart(employees, loginReferenceDate),
    [employees, loginReferenceDate]
  );

  const greenPlanQuarterBuckets = useMemo(
    () => buildGreenPlanQuarterBuckets(retirementStatusesForChart),
    [retirementStatusesForChart]
  );

  const selectedGreenPlanYearMembers = useMemo(() => {
    if (selectedGreenPlanYear === null) return [];
    return getGreenPlanMembersByYear(retirementStatusesForChart, selectedGreenPlanYear);
  }, [retirementStatusesForChart, selectedGreenPlanYear]);

  const selectedGreenPlanYearMemberGroups = useMemo(
    () => groupGreenPlanMembersByStartDate(selectedGreenPlanYearMembers),
    [selectedGreenPlanYearMembers]
  );

  const greenPlanMemberCount = useMemo(
    () => retirementStatuses.filter((item) => item.cohort === 'in_green_plan').length,
    [retirementStatuses]
  );

  const sabbaticalMemberCount = useMemo(
    () => retirementStatuses.filter((item) => item.cohort === 'in_sabbatical').length,
    [retirementStatuses]
  );

  const loadData = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);

    try {
      const [deptRows, memberRows, shiftRows] = await Promise.all([
        fetchDepartments(),
        fetchTeamMembers(),
        fetchShiftMembers().catch(() => [] as ShiftMemberRow[]),
      ]);
      setDepartments(deptRows);
      setEmployees(memberRows);
      setShiftMembers(shiftRows);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.';
      setDataError(message);
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedDeptId) return;
    setSelectedDeptId(currentUser.소속);
  }, [currentUser.소속, selectedDeptId]);

  const handleRefresh = async () => {
    setActionLoading(true);
    await loadData();
    setActionLoading(false);
  };

  const handleLogout = async () => {
    setActionLoading(true);
    try {
      await onLogout();
    } finally {
      setActionLoading(false);
    }
  };

  const totalMembers = employees.length;
  const departmentMemberBreakdown = useMemo(
    () => getDepartmentMemberBreakdown(departmentTree, memberCounts),
    [departmentTree, memberCounts]
  );
  const categoryMemberBreakdown = useMemo(
    () => countMembersByCategory(employees),
    [employees]
  );
  const averageAgeBreakdown = useMemo(
    () => calculateAverageAgeBreakdown(employees, loginReferenceDate),
    [employees, loginReferenceDate]
  );
  const memberDutyLabelsMap = useMemo(
    () => buildMemberDutyLabelsMap(shiftMembers, employees),
    [shiftMembers, employees]
  );
  const showDepartmentSummary =
    sidebarView === 'department' &&
    selectedDeptId !== null &&
    DEPT_SUMMARY_DEPARTMENT_IDS.has(selectedDeptId);
  const showMemberDutyColumn =
    sidebarView === 'department' &&
    selectedDeptId !== null &&
    DEPT_SUMMARY_DEPARTMENT_IDS.has(selectedDeptId);
  const parentDepartment = selectedDept
    ? findDepartmentParent(departments, selectedDept.id)
    : null;

  const selectDepartment = (departmentId: string) => {
    setSidebarView('department');
    setRetirementViewActive(false);
    setSelectedDeptId(departmentId);
  };

  const toggleTenureMenu = () => {
    if (sidebarView === 'tenure') {
      setSidebarView('department');
      return;
    }

    setRetirementViewActive(false);
    setSidebarView('tenure');
    setSelectedTenureMonthKey(null);
    setSelectedTenureEmpId(null);
  };

  const toggleRetirementMenu = () => {
    if (retirementViewActive) {
      setRetirementViewActive(false);
      setSidebarView('department');
      return;
    }

    setRetirementViewActive(true);
    setSidebarView('retirement');
    setSelectedGreenPlanYear(null);
  };

  const toggleShiftMenu = () => {
    if (sidebarView === 'shift') {
      setSidebarView('department');
      return;
    }

    setSidebarView('shift');
    setRetirementViewActive(false);
    setSelectedGreenPlanYear(null);
    setSelectedTenureMonthKey(null);
    setSelectedTenureEmpId(null);
  };

  const openScheduleMenu = () => {
    openWorkSchedule();
  };

  const toggleAccidentMenu = () => {
    if (sidebarView === 'accident') {
      setSidebarView('department');
      return;
    }

    setSidebarView('accident');
    setRetirementViewActive(false);
    setSelectedGreenPlanYear(null);
    setSelectedTenureMonthKey(null);
    setSelectedTenureEmpId(null);
  };

  const handleAccidentReportCountChange = useCallback((count: number) => {
    setAccidentReportCount(count);
  }, []);

  const getTransferDateDraft = (member: DashboardEmployee): string => {
    if (Object.prototype.hasOwnProperty.call(transferDateDrafts, member.id)) {
      return transferDateDrafts[member.id];
    }
    return member.transferDate ? formatTransferDate(member.transferDate) : '';
  };

  const handleTransferDateDraftChange = (memberId: string, value: string) => {
    setTransferDateDrafts((prev) => ({ ...prev, [memberId]: value }));
  };

  const commitTransferDate = async (memberId: string, rawValue: string) => {
    const parsed = normalizeTransferDateInput(rawValue);
    if (!parsed.ok) {
      alert('전입일 형식이 올바르지 않습니다. 예: 2020.3.15');
      const current = employees.find((employee) => employee.id === memberId)?.transferDate ?? null;
      setTransferDateDrafts((prev) => ({
        ...prev,
        [memberId]: current ? formatTransferDate(current) : '',
      }));
      return;
    }

    const transferDate = parsed.transferDate;
    const current = employees.find((employee) => employee.id === memberId)?.transferDate ?? null;
    if (transferDate === current) {
      setTransferDateDrafts((prev) => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
      return;
    }

    setSavingTransferDateId(memberId);

    try {
      await updateTeamMemberTransferDate(memberId, transferDate);
      setEmployees((prev) =>
        prev.map((employee) =>
          employee.id === memberId ? { ...employee, transferDate } : employee
        )
      );
      setTransferDateDrafts((prev) => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '전입일 저장에 실패했습니다.';
      alert(message);
    } finally {
      setSavingTransferDateId(null);
    }
  };

  const leaderContact = {
    name: currentUser.성명,
    department: currentUser.소속,
    email: currentUser.email,
  };

  const handleReminderCalendar = (tenure: TenureStatus) => {
    const url = buildReminderCalendarUrl(tenure, currentUser.성명);
    if (url) openExternalUrl(url);
  };

  const handleExpiryCalendar = (tenure: TenureStatus) => {
    const url = buildExpiryCalendarUrl(tenure, currentUser.성명);
    if (url) openExternalUrl(url);
  };

  const handleHrEmail = (tenure: TenureStatus) => {
    const url = buildHrReplacementEmailUrl(tenure, leaderContact);
    if (url) window.location.href = url;
  };

  const renderTenureDaysLabel = (tenure: TenureStatus): string => {
    if (tenure.status === 'unknown_hire_date') return '입사일 없음';
    if (tenure.daysUntilExpiry === null) return '-';
    if (tenure.daysUntilExpiry < 0) return `만기 ${Math.abs(tenure.daysUntilExpiry)}일 경과`;
    if (tenure.daysUntilExpiry === 0) return '오늘 만기';
    return `D-${tenure.daysUntilExpiry}`;
  };

  const selectTenureMember = (tenure: TenureStatus) => {
    setSelectedTenureEmpId(tenure.employee.id);
    if (tenure.expiryDate) {
      setSelectedTenureMonthKey(getTenureExpiryMonthKey(tenure.expiryDate));
    } else {
      setSelectedTenureMonthKey(null);
    }
  };

  const selectTenureMonthKey = (key: string | null) => {
    setSelectedTenureMonthKey(key);
    if (!key) {
      setSelectedTenureEmpId(null);
      return;
    }

    const members = getTenureMembersByMonthKey(tenureStatuses, key);
    const hasCurrentSelection = members.some(
      (member) => member.employee.id === selectedTenureEmpId
    );
    if (!hasCurrentSelection) {
      setSelectedTenureEmpId(members[0]?.employee.id ?? null);
    }
  };

  const renderTenureInlineActions = (tenure: TenureStatus) => (
    <div className="tenure-selection-inline-actions">
      <button
        type="button"
        className="tenure-action-btn calendar compact"
        onClick={() => handleReminderCalendar(tenure)}
        disabled={!tenure.reminderDate}
      >
        캘린더 (충원 요청)
      </button>
      <button
        type="button"
        className="tenure-action-btn calendar compact"
        onClick={() => handleExpiryCalendar(tenure)}
        disabled={!tenure.expiryDate}
      >
        캘린더 (만기 1개월 전 알림)
      </button>
      <button
        type="button"
        className="tenure-action-btn email compact"
        onClick={() => handleHrEmail(tenure)}
        disabled={!tenure.expiryDate}
      >
        인사부 요청 메일
      </button>
    </div>
  );

  const renderTenureSelectionEntry = (tenure: TenureStatus) => (
    <div
      key={tenure.employee.id}
      className={`tenure-selection-entry${selectedTenureEmpId === tenure.employee.id ? ' selected' : ''}`}
    >
      <div className="tenure-selection-entry-head">
        <span className="green-plan-chart-selection-chip-top">
          {tenure.employee.name}
          <span
            className={`tenure-category-badge ${getCategoryBadgeClass(tenure.employee.category)}`}
          >
            {getCategoryBadgeLabel(tenure.employee.category)}
          </span>
        </span>
        <span className="green-plan-chart-selection-chip-meta">
          {tenure.employee.department} · {tenure.employee.displayId}
        </span>
      </div>
      <div className="tenure-selection-inline-fields">
        <span className="tenure-selection-inline-field">
          <span className="tenure-selection-inline-label">만기</span>
          <span className="tenure-selection-inline-value">
            {tenure.expiryDate ? formatDateDot(tenure.expiryDate) : '-'}
          </span>
        </span>
        <span className="tenure-selection-inline-field">
          <span className="tenure-selection-inline-label">충원 요청</span>
          <span className="tenure-selection-inline-value">
            {tenure.reminderDate ? formatDateDot(tenure.reminderDate) : '-'}
          </span>
        </span>
        <span className="tenure-selection-inline-field">
          <span className="tenure-selection-inline-label">만기까지</span>
          <span
            className={`tenure-selection-inline-value days-${getTenureStatusClass(tenure.status)}`}
          >
            {renderTenureDaysLabel(tenure)}
          </span>
        </span>
      </div>
      {renderTenureInlineActions(tenure)}
    </div>
  );

  const renderTenureRosterLine = (tenure: TenureStatus) => (
    <button
      key={tenure.employee.id}
      type="button"
      className={`tenure-roster-card${selectedTenureEmpId === tenure.employee.id ? ' selected' : ''}`}
      onClick={() => selectTenureMember(tenure)}
    >
      <span
        className={`tenure-category-badge compact ${getCategoryBadgeClass(tenure.employee.category)}`}
      >
        {getCategoryBadgeLabel(tenure.employee.category)}
      </span>
      <span className="tenure-roster-name">{tenure.employee.name}</span>
      <span className="tenure-roster-meta">
        {tenure.employee.department} · {tenure.employee.displayId}
      </span>
    </button>
  );

  const renderTenureOverview = () => (
    <section className="dept-detail-card tenure-overview-card">
      <div className="dept-detail-header">
        <div>
          <h3 className="dept-detail-title">계약직 파견직 근무현황</h3>
          <div className="retirement-rule-guide">
            <div className="retirement-rule-item">
              <span className="retirement-rule-label">근무 만기</span>
              <span className="retirement-rule-eq">=</span>
              <span className="retirement-rule-value">입사일 + 2년 − 1일</span>
            </div>
            <div className="retirement-rule-item">
              <span className="retirement-rule-label">계약직</span>
              <span className="retirement-rule-eq">=</span>
              <span className="retirement-rule-value">만기 3개월 전 충원 요청</span>
            </div>
            <div className="retirement-rule-item">
              <span className="retirement-rule-label">파견직</span>
              <span className="retirement-rule-eq">=</span>
              <span className="retirement-rule-value">만기 2개월 전 충원 요청</span>
            </div>
          </div>
        </div>
        <span className="dept-detail-badge tenure-overview-badge">
          계약·파견 {tenureStatuses.length}명
        </span>
      </div>

      <section className="tenure-roster-section">
        <h4 className="tenure-roster-title">계약·파견 구성원 명단</h4>
        {tenureStatuses.length === 0 ? (
          <p className="tenure-roster-empty">표시할 계약직·파견직 구성원이 없습니다.</p>
        ) : (
          <div className="tenure-roster-list">
            {tenureStatuses.map((tenure) => renderTenureRosterLine(tenure))}
          </div>
        )}
      </section>

      <TenureExpiryChart
        buckets={tenureExpiryMonthBuckets}
        selectedMonthKey={selectedTenureMonthKey}
        onSelectMonthKey={selectTenureMonthKey}
        referenceDate={loginReferenceDate}
      />

      {selectedTenureMonthKey && (
        <div className="green-plan-chart-selection tenure-month-selection">
          <div className="green-plan-chart-selection-header">
            <h4 className="green-plan-chart-selection-title">
              {selectedTenureMonthLabel} 근무 만기 · {selectedTenureMonthMembers.length}명
            </h4>
            <button
              type="button"
              className="green-plan-chart-selection-clear"
              onClick={() => {
                setSelectedTenureMonthKey(null);
                setSelectedTenureEmpId(null);
              }}
            >
              선택 해제
            </button>
          </div>
          {selectedTenureMonthMembers.length === 0 ? (
            <div className="sidebar-empty">해당 월 근무 만기 대상자가 없습니다.</div>
          ) : (
            <div className="green-plan-chart-selection-list">
              {selectedTenureMonthMembers.map((tenure) => renderTenureSelectionEntry(tenure))}
            </div>
          )}
        </div>
      )}
    </section>
  );

  const renderRetirementOverview = () => (
    <section className="dept-detail-card retirement-overview-card">
      <div className="dept-detail-header">
        <div>
          <h3 className="dept-detail-title">정년퇴직 현황</h3>
          <div className="retirement-rule-guide">
            <div className="retirement-rule-item">
              <span className="retirement-rule-label">정년퇴직</span>
              <span className="retirement-rule-eq">=</span>
              <span className="retirement-rule-value">만 60세</span>
            </div>
            <div className="retirement-rule-item">
              <span className="retirement-rule-label">안식년</span>
              <span className="retirement-rule-eq">=</span>
              <span className="retirement-rule-value">정년 − 1년</span>
            </div>
            <div className="retirement-rule-item">
              <span className="retirement-rule-label">그린플랜</span>
              <span className="retirement-rule-eq">=</span>
              <span className="retirement-rule-value">안식년 − 12주</span>
            </div>
          </div>
        </div>
        <span className="dept-detail-badge retirement-badge">
          그린플랜 {greenPlanMemberCount}명 · 안식년 {sabbaticalMemberCount}명
        </span>
      </div>

      <GreenPlanStartChart
        buckets={greenPlanQuarterBuckets}
        selectedYear={selectedGreenPlanYear}
        onSelectYear={setSelectedGreenPlanYear}
        referenceDate={loginReferenceDate}
      />

      {selectedGreenPlanYear !== null && (
        <div className="green-plan-chart-selection">
          <div className="green-plan-chart-selection-header">
            <h4 className="green-plan-chart-selection-title">
              {selectedGreenPlanYear}년 그린플랜 시작 대상 · {selectedGreenPlanYearMembers.length}명
            </h4>
            <button
              type="button"
              className="green-plan-chart-selection-clear"
              onClick={() => setSelectedGreenPlanYear(null)}
            >
              선택 해제
            </button>
          </div>
          <div className="green-plan-chart-selection-groups">
            {selectedGreenPlanYearMemberGroups.map((group) => (
              <div key={group.key} className="green-plan-date-group">
                <div className="green-plan-date-group-header">
                  <span className="green-plan-date-group-label">{group.label}</span>
                  <span className="green-plan-date-group-count">{group.members.length}명</span>
                </div>
                <div className="green-plan-chart-selection-list">
                  {group.members.map((status) => {
                    const category = normalizeMemberCategory(status.employee.category) || '구분 미등록';
                    return (
                    <span key={status.employee.id} className="green-plan-chart-selection-chip">
                      <span className="green-plan-chart-selection-chip-top">
                        {status.employee.name}
                        <span className={`green-plan-category-badge category-${category === '전문직' ? 'pro' : category === '일반직' ? 'general' : 'other'}`}>
                          {category}
                        </span>
                      </span>
                      <span className="green-plan-chart-selection-chip-meta">
                        {status.employee.department} · {status.employee.displayId}
                      </span>
                    </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );

  return (
    <div className="dashboard-container dept-management">
      <aside className="sidebar">
        <div className="sidebar-header">
          <LeaderPageNav activePage={activePage} onNavigate={onNavigate} />
          <p className="sidebar-subtitle">부서 조직 및 구성원 현황</p>
        </div>

        <div className="user-panel">
          <div className="user-panel-top">
            <span className="user-panel-name">{currentUser.성명}</span>
            <span className="user-panel-badge">팀장</span>
          </div>
          <div className="user-panel-meta">
            {currentUser.직급 ?? '직급 미등록'}
            {currentUser.직위 ? ` · ${currentUser.직위}` : ''} · {currentUser.소속} · 사번{' '}
            {formatEmployeeId(currentUser.사번, currentUser.구분)}
          </div>
        </div>

        <div className="sidebar-actions">
          <button
            type="button"
            className="sidebar-btn"
            onClick={() => void handleRefresh()}
            disabled={dataLoading || actionLoading}
          >
            {dataLoading ? '불러오는 중...' : '새로고침'}
          </button>
          <button
            type="button"
            className="sidebar-btn primary"
            onClick={() => void handleLogout()}
            disabled={actionLoading}
          >
            로그아웃
          </button>
        </div>

        <div className="search-box">
          <input
            type="search"
            className="search-input"
            placeholder={
              retirementViewActive
                ? '이름, 사번, 소속, 정년 분기 검색...'
                : sidebarView === 'shift'
                  ? '이름, 사번, 직위 검색...'
                  : '부서명 검색...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="dept-tree-list">
          {dataLoading && <div className="loading-overlay">목록 불러오는 중...</div>}
          {dataError && !dataLoading && (
            <div className="sidebar-empty" style={{ color: '#b91c1c' }}>
              {dataError}
            </div>
          )}
          {!dataLoading && !dataError && filteredTree.length === 0 && sidebarView === 'department' && (
            <div className="sidebar-empty">표시할 부서가 없습니다.</div>
          )}
          {!dataLoading &&
            !dataError &&
            filteredTree.map((node) => (
              <DeptTreeItem
                key={node.id}
                node={node}
                depth={0}
                selectedDeptId={selectedDeptId}
                sidebarView={sidebarView}
                memberCounts={memberCounts}
                onSelect={selectDepartment}
              />
            ))}

          <div className="tenure-sidebar-section">
            <button
              type="button"
              className={`dept-tree-item tenure-menu-item shift-menu-item${sidebarView === 'shift' ? ' selected' : ''}`}
              onClick={toggleShiftMenu}
              aria-pressed={sidebarView === 'shift'}
            >
              <span className="dept-tree-name">근무조 및 직무 편성</span>
            </button>
          </div>

          <div className="tenure-sidebar-section">
            <button
              type="button"
              className="dept-tree-item tenure-menu-item schedule-menu-item"
              onClick={openScheduleMenu}
            >
              <span className="dept-tree-name">근무표_조상익 개발 연결</span>
            </button>
          </div>

          <div className="tenure-sidebar-section">
            <button
              type="button"
              className={`dept-tree-item tenure-menu-item retirement-menu-item${retirementViewActive ? ' selected' : ''}`}
              onClick={toggleRetirementMenu}
              aria-pressed={retirementViewActive}
            >
              <span className="dept-tree-name">정년퇴직 현황</span>
              <span className="dept-tree-count">5년 간 {retirementStatuses.length}명</span>
            </button>
          </div>

          <div className="tenure-sidebar-section">
            <button
              type="button"
              className={`dept-tree-item tenure-menu-item${sidebarView === 'tenure' ? ' selected' : ''}`}
              onClick={toggleTenureMenu}
              aria-pressed={sidebarView === 'tenure'}
            >
              <span className="dept-tree-name">계약직 파견직 근무현황</span>
              <span className="dept-tree-count">{tenureStatuses.length}명</span>
            </button>
          </div>

          <div className="tenure-sidebar-section">
            <button
              type="button"
              className={`dept-tree-item tenure-menu-item accident-menu-item${sidebarView === 'accident' ? ' selected' : ''}`}
              onClick={toggleAccidentMenu}
              aria-pressed={sidebarView === 'accident'}
            >
              <span className="dept-tree-name">사고 보고</span>
              {accidentReportCount !== null && (
                <span className="dept-tree-count">{accidentReportCount}건</span>
              )}
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        {showDepartmentSummary && (
          <section className="dept-summary-bar">
            <div className="dept-summary-row">
              <h2 className="dept-summary-title-inline">부서 현황</h2>
              <div className="dept-summary-stat">
                <div className="dept-summary-stat-label">총 인원</div>
                <div className="dept-summary-stat-value">{totalMembers}명</div>
              </div>
              <div className="dept-summary-stat dept-member-breakdown-stat">
                <div className="dept-summary-stat-label">구분별 인원</div>
                <div className="dept-member-breakdown-list">
                  {categoryMemberBreakdown.map((item) => (
                    <div key={item.id} className="dept-member-breakdown-item">
                      <span
                        className={`dept-member-breakdown-name dept-category-name category-${item.id === '전문직' ? 'pro' : item.id === '일반직' ? 'general' : item.id === '계약직' ? 'contract' : 'dispatch'}`}
                      >
                        {item.label}
                      </span>
                      <span className="dept-member-breakdown-count">{item.count}명</span>
                    </div>
                  ))}
                </div>
              </div>
              {averageAgeBreakdown.map((item) => (
                <div key={item.id} className="dept-summary-stat dept-age-stat">
                  <div className="dept-summary-stat-label">{item.label}</div>
                  <div className="dept-summary-stat-value">{item.value}</div>
                  <div className="dept-age-stat-count">{item.count}명</div>
                </div>
              ))}
              <div className="dept-summary-stat dept-member-breakdown-stat">
                <div className="dept-summary-stat-label">부서 인원</div>
                <div className="dept-member-breakdown-list">
                  {departmentMemberBreakdown.map((item) => (
                    <div key={item.id} className="dept-member-breakdown-item">
                      <span
                        className={`dept-member-breakdown-name${item.isRootTeam ? ' root-team' : ''}`}
                        title={item.id}
                      >
                        {item.id}
                      </span>
                      <span className="dept-member-breakdown-count">{item.count}명</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="dept-detail-panel">
          {sidebarView === 'tenure' ? (
            <>
              {tenureNeedingAction.length > 0 && (
                <div className="tenure-summary-alert">
                  대체채용 요청이 필요한 구성원 {tenureNeedingAction.length}명이 있습니다.
                </div>
              )}
              {renderTenureOverview()}
            </>
          ) : sidebarView === 'retirement' ? (
            renderRetirementOverview()
          ) : sidebarView === 'shift' ? (
            <ShiftAssignmentManagement employees={employees} />
          ) : sidebarView === 'accident' ? (
            <AccidentReportManagementPanel onCountChange={handleAccidentReportCountChange} />
          ) : !selectedDept ? (
            <div className="empty-state">
              <div className="empty-state-icon">🏢</div>
              <h3 className="empty-state-title">부서를 선택하세요</h3>
              <p className="empty-state-text">
                왼쪽 목록에서 부서를 선택하면 구성원 정보를 확인할 수 있습니다.
              </p>
            </div>
          ) : (
            <section className="dept-detail-card">
              <div className="dept-detail-header">
                <div>
                  <h3 className="dept-detail-title">{selectedDept.id}</h3>
                  <p className="dept-detail-subtitle">
                    {parentDepartment ? `상위 부서: ${parentDepartment}` : '최상위 부서'} · 구성원{' '}
                    {selectedMembers.length}명
                  </p>
                </div>
                {selectedDept.id === currentUser.소속 && (
                  <span className="dept-detail-badge">본인 팀</span>
                )}
              </div>

              {selectedDept.children.length > 0 && (
                <div className="dept-child-list">
                  {selectedDept.children.map((child) => (
                    <span key={child.id} className="dept-child-chip">
                      {child.id} ({memberCounts[child.id] ?? 0}명)
                    </span>
                  ))}
                </div>
              )}

              {selectedMembers.length === 0 ? (
                <div className="sidebar-empty">이 부서에 표시할 구성원이 없습니다.</div>
              ) : (
                <table className="dept-member-table">
                  <thead>
                    <tr>
                      <th>이름</th>
                      <th>직급</th>
                      {showMemberDutyColumn && <th>직무</th>}
                      <th>전입일</th>
                      <th>나이</th>
                      <th>사번</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedMembers.map((member) => {
                      const transferTenure = formatTransferTenure(
                        member.transferDate,
                        loginReferenceDate
                      );

                      return (
                      <tr key={member.id}>
                        <td>{member.name}</td>
                        <td>{member.position}</td>
                        {showMemberDutyColumn && (
                          <td className="dept-member-duty">
                            {getMemberDutyLabel(member.id, memberDutyLabelsMap)}
                          </td>
                        )}
                        <td className="dept-member-transfer-date">
                          <div className="dept-member-transfer-date-row">
                            <input
                              type="text"
                              className="dept-member-transfer-date-text-input"
                              value={getTransferDateDraft(member)}
                              onChange={(event) =>
                                handleTransferDateDraftChange(member.id, event.target.value)
                              }
                              onBlur={(event) =>
                                void commitTransferDate(member.id, event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.currentTarget.blur();
                                }
                              }}
                              placeholder="예: 2020.3.15"
                              disabled={savingTransferDateId === member.id}
                              aria-label={`${member.name} 전입일`}
                            />
                            {transferTenure ? (
                              <span className="dept-member-transfer-tenure">
                                {transferTenure}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>{formatMemberAge(member.birthDate, loginReferenceDate)}</td>
                        <td>{member.displayId}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
