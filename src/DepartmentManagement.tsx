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
  formatDateKorean,
  formatDateDot,
  formatReminderLeadTime,
  formatReminderMonthsBeforeExpiry,
  getCategoryBadgeClass,
  getCategoryBadgeLabel,
  getTenureExpiryMonthKey,
  getTenureListBadgeClass,
  getTenureListBadgeLabel,
  getTenureMembersByMonthKey,
  getTenureStatusClass,
  getTenureStatusLabel,
  groupTenureMembersByExpiryDate,
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
import TenureExpiryChart from './TenureExpiryChart';
import LeaderPageNav, { type LeaderPage } from './LeaderPageNav';
import {
  type DashboardEmployee,
  calculateAverageAgeBreakdown,
  fetchTeamMembers,
  formatEmployeeId,
  formatMemberAge,
  normalizeMemberCategory,
} from './teamMemberService';
import './Dashboard.css';
import './DepartmentManagement.css';

interface DepartmentManagementProps {
  currentUser: TeamMemberProfile;
  onLogout: () => Promise<void>;
  activePage: LeaderPage;
  onNavigate: (page: LeaderPage) => void;
  loginReferenceDate: Date;
}

type SidebarView = 'department' | 'tenure' | 'retirement';

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
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [sidebarView, setSidebarView] = useState<SidebarView>('department');
  const [tenureListExpanded, setTenureListExpanded] = useState(false);
  const [retirementViewActive, setRetirementViewActive] = useState(false);
  const [selectedGreenPlanYear, setSelectedGreenPlanYear] = useState<number | null>(null);
  const [selectedTenureMonthKey, setSelectedTenureMonthKey] = useState<string | null>(null);
  const [selectedTenureEmpId, setSelectedTenureEmpId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

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
    if (!query || tenureListExpanded || retirementViewActive) return departmentTree;

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
  }, [departmentTree, flatDepartments, searchQuery, tenureListExpanded, retirementViewActive]);

  const selectedDept = useMemo(
    () => flatDepartments.find((dept) => dept.id === selectedDeptId) ?? null,
    [flatDepartments, selectedDeptId]
  );

  const selectedMembers = useMemo(
    () => (selectedDeptId ? getMembersInDepartment(employees, selectedDeptId) : []),
    [employees, selectedDeptId]
  );

  const tenureStatuses = useMemo(
    () => buildTenureStatuses(employees, loginReferenceDate),
    [employees, loginReferenceDate]
  );

  const filteredTenureStatuses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return tenureStatuses;
    return tenureStatuses.filter((item) => {
      const emp = item.employee;
      return (
        emp.name.toLowerCase().includes(query) ||
        emp.id.toLowerCase().includes(query) ||
        emp.displayId.toLowerCase().includes(query) ||
        emp.department.toLowerCase().includes(query) ||
        (emp.category ?? '').toLowerCase().includes(query)
      );
    });
  }, [tenureStatuses, searchQuery]);

  const selectedTenure = useMemo(
    () => tenureStatuses.find((item) => item.employee.id === selectedTenureEmpId) ?? null,
    [tenureStatuses, selectedTenureEmpId]
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

  const selectedTenureMonthMemberGroups = useMemo(
    () => groupTenureMembersByExpiryDate(selectedTenureMonthMembers),
    [selectedTenureMonthMembers]
  );

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
      const [deptRows, memberRows] = await Promise.all([
        fetchDepartments(),
        fetchTeamMembers(),
      ]);
      setDepartments(deptRows);
      setEmployees(memberRows);
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
  const averageAgeBreakdown = useMemo(
    () => calculateAverageAgeBreakdown(employees, loginReferenceDate),
    [employees, loginReferenceDate]
  );
  const parentDepartment = selectedDept
    ? findDepartmentParent(departments, selectedDept.id)
    : null;

  const selectDepartment = (departmentId: string) => {
    setSidebarView('department');
    setRetirementViewActive(false);
    setSelectedDeptId(departmentId);
  };

  const toggleTenureMenu = () => {
    if (tenureListExpanded) {
      setTenureListExpanded(false);
      setSidebarView('department');
      return;
    }

    setTenureListExpanded(true);
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
    setTenureListExpanded(false);
    setSidebarView('retirement');
    setSelectedGreenPlanYear(null);
  };

  const selectTenureEmployee = (employeeId: string) => {
    setTenureListExpanded(true);
    setRetirementViewActive(false);
    setSidebarView('tenure');
    setSelectedTenureEmpId(employeeId);
    const tenure = tenureStatuses.find((item) => item.employee.id === employeeId);
    if (tenure?.expiryDate) {
      setSelectedTenureMonthKey(getTenureExpiryMonthKey(tenure.expiryDate));
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
    <div key={tenure.employee.id} className="tenure-selection-entry">
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

  const renderTenureEmployeeDetailContent = (tenure: TenureStatus) => {
    const canRequestReplacement =
      tenure.status === 'reminder_window' || tenure.status === 'expired';

    return (
      <>
        <div className="tenure-selection-detail-header">
          <div>
            <h4 className="tenure-selection-detail-name">{tenure.employee.name}</h4>
            <p className="tenure-selection-detail-subtitle">
              {tenure.employee.category ?? '구분 미등록'} · {tenure.employee.department}{' '}
              · 사번 {tenure.employee.displayId}
            </p>
          </div>
          <span className={`tenure-status-badge ${getTenureStatusClass(tenure.status)}`}>
            {getTenureStatusLabel(tenure.status)}
          </span>
        </div>

        {canRequestReplacement && (
          <div className="tenure-alert">
            {tenure.status === 'reminder_window'
              ? `근무 만기 ${formatReminderLeadTime(tenure.employee.category)} 전입니다. 인사부에 대체 채용을 요청해 주세요.`
              : '근무 만기가 지났습니다. 인사부에 대체 채용 현황을 확인해 주세요.'}
          </div>
        )}

        <div className="tenure-info-grid">
          <div className="tenure-info-item">
            <span className="tenure-info-label">입사일</span>
            <span className="tenure-info-value">
              {tenure.hireDate ? formatDateKorean(tenure.hireDate) : '-'}
            </span>
          </div>
          <div className="tenure-info-item">
            <span className="tenure-info-label">근무 만기</span>
            <span className="tenure-info-value">
              {tenure.expiryDate ? formatDateKorean(tenure.expiryDate) : '-'}
            </span>
          </div>
          <div className="tenure-info-item">
            <span className="tenure-info-label">
              인력 충원 요청일
              <span className="tenure-info-label-note">
                ({formatReminderMonthsBeforeExpiry(tenure.employee.category)})
              </span>
            </span>
            <span className="tenure-info-value">
              {tenure.reminderDate ? formatDateKorean(tenure.reminderDate) : '-'}
            </span>
          </div>
          <div className="tenure-info-item">
            <span className="tenure-info-label">만기까지</span>
            <span className={`tenure-info-value days-${getTenureStatusClass(tenure.status)}`}>
              {renderTenureDaysLabel(tenure)}
            </span>
          </div>
        </div>

        <div className="tenure-action-group">
          <h4 className="tenure-action-title">팀장 알림 · 인사부 요청</h4>
          <div className="tenure-action-buttons">
            <button
              type="button"
              className="tenure-action-btn calendar"
              onClick={() => handleReminderCalendar(tenure)}
              disabled={!tenure.reminderDate}
            >
              구글 캘린더 (대체채용 요청)
            </button>
            <button
              type="button"
              className="tenure-action-btn calendar"
              onClick={() => handleExpiryCalendar(tenure)}
              disabled={!tenure.expiryDate}
            >
              구글 캘린더 (만기 1개월 전 알림)
            </button>
            <button
              type="button"
              className="tenure-action-btn email"
              onClick={() => handleHrEmail(tenure)}
              disabled={!tenure.expiryDate}
            >
              인사부 대체채용 요청 메일
            </button>
          </div>
          <p className="tenure-action-note">
            캘린더 등록 시 팀장 구글 캘린더에 일정이 추가됩니다. 메일 발송 시 팀장 이메일이 참조(CC)에
            포함됩니다.
          </p>
        </div>
      </>
    );
  };

  const renderTenureEmployeeDetail = (tenure: TenureStatus) => (
    <section className="dept-detail-card tenure-detail-card tenure-detail-card-nested">
      {renderTenureEmployeeDetailContent(tenure)}
    </section>
  );

  const renderTenureOverview = () => (
    <section className="dept-detail-card tenure-overview-card">
      <div className="dept-detail-header">
        <div>
          <h3 className="dept-detail-title">2년 근무 현황</h3>
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

      <TenureExpiryChart
        buckets={tenureExpiryMonthBuckets}
        selectedMonthKey={selectedTenureMonthKey}
        onSelectMonthKey={(key) => {
          setSelectedTenureMonthKey(key);
          if (key) {
            const members = getTenureMembersByMonthKey(tenureStatuses, key);
            setSelectedTenureEmpId(members[0]?.employee.id ?? null);
          } else {
            setSelectedTenureEmpId(null);
          }
        }}
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
          {selectedTenureMonthMemberGroups.length === 0 ? (
            <div className="sidebar-empty">해당 월 근무 만기 대상자가 없습니다.</div>
          ) : (
            <div className="green-plan-chart-selection-groups">
              {selectedTenureMonthMemberGroups.map((group) => (
                <div key={group.key} className="green-plan-date-group">
                  <div className="green-plan-date-group-header">
                    <span className="green-plan-date-group-label">만기 {group.label}</span>
                    <span className="green-plan-date-group-count">{group.members.length}명</span>
                  </div>
                  <div className="green-plan-chart-selection-list">
                    {group.members.map((tenure) => renderTenureSelectionEntry(tenure))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedTenure && !selectedTenureMonthKey && renderTenureEmployeeDetail(selectedTenure)}
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
    <div className="dashboard-container">
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
              tenureListExpanded
                ? '이름, 사번, 구분 검색...'
                : retirementViewActive
                  ? '이름, 사번, 소속, 정년 분기 검색...'
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
              className={`dept-tree-item tenure-menu-item${tenureListExpanded ? ' expanded' : ''}${sidebarView === 'tenure' ? ' selected' : ''}`}
              onClick={toggleTenureMenu}
              aria-expanded={tenureListExpanded}
            >
              <span className="tenure-menu-chevron" aria-hidden="true">
                {tenureListExpanded ? '▾' : '▸'}
              </span>
              <span className="dept-tree-name">2년 근무 현황</span>
              <span className="dept-tree-count">{tenureStatuses.length}명</span>
            </button>

            {tenureListExpanded && (
              <div className="tenure-employee-list">
                {!dataLoading && filteredTenureStatuses.length === 0 && (
                  <div className="sidebar-empty">계약직·파견직 구성원이 없습니다.</div>
                )}
                {!dataLoading &&
                  filteredTenureStatuses.map((tenure) => (
                    <button
                      key={tenure.employee.id}
                      type="button"
                      className={`dept-tree-item tenure-employee-item category-${getCategoryBadgeClass(tenure.employee.category)}${selectedTenureEmpId === tenure.employee.id ? ' selected' : ''}`}
                      onClick={() => selectTenureEmployee(tenure.employee.id)}
                    >
                      <div className="tenure-employee-left">
                        <div className="tenure-employee-top">
                          <span
                            className={`tenure-category-badge ${getCategoryBadgeClass(tenure.employee.category)}`}
                          >
                            {getCategoryBadgeLabel(tenure.employee.category)}
                          </span>
                          <span className="dept-tree-name">{tenure.employee.name}</span>
                        </div>
                        <div className="tenure-employee-meta">{renderTenureDaysLabel(tenure)}</div>
                      </div>
                      <span
                        className={`tenure-status-badge compact ${getTenureListBadgeClass(tenure)}`}
                        title={tenure.status === 'active' ? tenure.employee.department : undefined}
                      >
                        {getTenureListBadgeLabel(tenure)}
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="tenure-sidebar-section">
            <button
              type="button"
              className={`dept-tree-item tenure-menu-item retirement-menu-item${retirementViewActive ? ' selected' : ''}`}
              onClick={toggleRetirementMenu}
              aria-pressed={retirementViewActive}
            >
              <span className="dept-tree-name">정년퇴직현황</span>
              <span className="dept-tree-count">5년 간 {retirementStatuses.length}명</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <section className="dept-summary-bar">
          <div className="dept-summary-row">
            <h2 className="dept-summary-title-inline">부서 현황</h2>
            <div className="dept-summary-stat">
              <div className="dept-summary-stat-label">총 인원</div>
              <div className="dept-summary-stat-value">{totalMembers}명</div>
            </div>
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
            {averageAgeBreakdown.map((item) => (
              <div key={item.id} className="dept-summary-stat dept-age-stat">
                <div className="dept-summary-stat-label">{item.label}</div>
                <div className="dept-summary-stat-value">{item.value}</div>
                <div className="dept-age-stat-count">{item.count}명</div>
              </div>
            ))}
          </div>
        </section>

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
                      <th>나이</th>
                      <th>사번</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedMembers.map((member) => (
                      <tr key={member.id}>
                        <td>{member.name}</td>
                        <td>{member.position}</td>
                        <td>{formatMemberAge(member.birthDate, loginReferenceDate)}</td>
                        <td>{member.displayId}</td>
                      </tr>
                    ))}
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
