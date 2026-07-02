import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TeamMemberProfile } from './authService';
import {
  type DashboardEmployee,
  fetchTeamMembers,
  formatEmployeeId,
  groupEmployeesByDepartment,
  sortDepartments,
} from './teamMemberService';
import {
  type InterviewForm,
  type InterviewRecord,
  type InterviewStatus,
  fetchInterviewsFromSupabase,
  getEmployeeDbKey,
  isMissingTableError,
  saveInterviewToSupabase,
} from './interviewService';
import LeaderPageNav, { type LeaderPage } from './LeaderPageNav';

import './Dashboard.css';

interface DashboardProps {
  currentUser: TeamMemberProfile;
  onLogout: () => Promise<void>;
  activePage: LeaderPage;
  onNavigate: (page: LeaderPage) => void;
}

type Employee = DashboardEmployee;
type SaveStatus = 'idle' | 'saving' | 'error';

const DEFAULT_FORM: InterviewForm = {
  date: new Date().toISOString().split('T')[0],
  purpose: '정기면담',
  content: '',
  feedback: '',
  complaints: '',
};

const hasFormContent = (form: InterviewForm): boolean =>
  Boolean(form.content.trim() || form.feedback.trim() || form.complaints.trim());

const getStatusClass = (status: InterviewStatus): string => {
  switch (status) {
    case '작성중':
      return 'draft';
    case '저장완료':
      return 'saved';
    case '대상외':
      return 'excluded';
    default:
      return 'empty';
  }
};

export default function Dashboard({
  currentUser,
  onLogout,
  activePage,
  onNavigate,
}: DashboardProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [interviewRecords, setInterviewRecords] = useState<Record<string, InterviewRecord>>({});
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [form, setForm] = useState<InterviewForm>(DEFAULT_FORM);
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [interviewTableReady, setInterviewTableReady] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [actionLoading, setActionLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const formPanelRef = useRef<HTMLDivElement>(null);

  const departments = useMemo(
    () => sortDepartments(employees.map((e) => e.department), currentUser.소속),
    [employees, currentUser.소속]
  );

  const getRecordForEmployee = useCallback(
    (emp: Employee): InterviewRecord | undefined =>
      interviewRecords[getEmployeeDbKey(emp)],
    [interviewRecords]
  );

  const getStatusForEmployee = useCallback(
    (emp: Employee): InterviewStatus => getRecordForEmployee(emp)?.status ?? '미입력',
    [getRecordForEmployee]
  );

  const loadData = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);

    try {
      const members = await fetchTeamMembers();
      setEmployees(members);

      try {
        const records = await fetchInterviewsFromSupabase();
        setInterviewRecords(records);
        setInterviewTableReady(true);
      } catch (err: unknown) {
        if (isMissingTableError(err as { code?: string; message?: string })) {
          setInterviewRecords({});
          setInterviewTableReady(false);
        } else {
          throw err;
        }
      }
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

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return employees.filter((emp) => {
      if (deptFilter !== 'all' && emp.department !== deptFilter) return false;
      if (!query) return true;
      return (
        emp.name.toLowerCase().includes(query) ||
        emp.id.toLowerCase().includes(query) ||
        emp.displayId.toLowerCase().includes(query) ||
        emp.department.toLowerCase().includes(query) ||
        emp.position.toLowerCase().includes(query)
      );
    });
  }, [employees, searchQuery, deptFilter]);

  const groupedEmployees = useMemo(
    () => groupEmployeesByDepartment(filteredEmployees, departments),
    [filteredEmployees, departments]
  );

  const selectedEmp = useMemo(
    () => employees.find((e) => e.id === selectedEmpId) ?? null,
    [employees, selectedEmpId]
  );

  const summaryStats = useMemo(() => {
    const counts: Record<InterviewStatus, number> = {
      미입력: 0,
      작성중: 0,
      저장완료: 0,
      대상외: 0,
    };
    employees.forEach((emp) => {
      counts[getStatusForEmployee(emp)] += 1;
    });
    return counts;
  }, [employees, getStatusForEmployee]);

  const selectEmployee = (emp: Employee) => {
    setSelectedEmpId(emp.id);
    const record = getRecordForEmployee(emp);
    setForm(record?.form ?? { ...DEFAULT_FORM });
  };

  useEffect(() => {
    if (!selectedEmpId) return;
    formPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectedEmpId]);

  const updateFormField = <K extends keyof InterviewForm>(key: K, value: InterviewForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const copyFieldValue = async (fieldKey: string, value: string) => {
    const text = value.trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldKey);
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch {
      alert('복사에 실패했습니다.');
    }
  };

  const renderFormFieldHeader = (label: string, fieldKey: string, value: string, htmlFor: string) => (
    <div className="form-label-row">
      <label className="form-label" htmlFor={htmlFor}>
        {label}
      </label>
      <button
        type="button"
        className={`form-copy-btn${copiedField === fieldKey ? ' copied' : ''}`}
        onClick={() => void copyFieldValue(fieldKey, value)}
        disabled={!value.trim()}
      >
        {copiedField === fieldKey ? '복사됨' : '복사'}
      </button>
    </div>
  );

  const upsertInterviewRecord = async (
    emp: Employee,
    nextForm: InterviewForm,
    status: InterviewStatus,
    successMessage?: string
  ) => {
    setSaveStatus('saving');

    try {
      await saveInterviewToSupabase(emp, nextForm, status);
      setInterviewRecords((prev) => ({
        ...prev,
        [getEmployeeDbKey(emp)]: { form: { ...nextForm }, status },
      }));
      setInterviewTableReady(true);
      setSaveStatus('idle');
      if (successMessage) alert(successMessage);
    } catch (err: unknown) {
      console.error('Error saving interview:', err);
      setSaveStatus('error');
      if (isMissingTableError(err as { code?: string; message?: string })) {
        setInterviewTableReady(false);
        alert(
          'team_interview 테이블이 없습니다.\n\nSupabase Dashboard → SQL Editor에서\nsupabase/migrations/001_create_team_interview.sql 을 실행해 주세요.'
        );
      } else {
        const message = err instanceof Error ? err.message : '저장에 실패했습니다.';
        alert(message);
      }
    }
  };

  const handleDraftSave = async () => {
    if (!selectedEmp) {
      alert('면담 대상 사원을 선택해주세요.');
      return;
    }
    if (!hasFormContent(form)) {
      alert('면담 내용을 입력한 후 작성중으로 저장할 수 있습니다.');
      return;
    }
    await upsertInterviewRecord(selectedEmp, form, '작성중', '작성중 상태로 저장되었습니다.');
  };

  const handleExcludeSave = async () => {
    if (!selectedEmp) {
      alert('면담 대상 사원을 선택해주세요.');
      return;
    }
    const excludeForm: InterviewForm = {
      ...DEFAULT_FORM,
      date: new Date().toISOString().split('T')[0],
    };
    await upsertInterviewRecord(selectedEmp, excludeForm, '대상외', '대상외로 저장되었습니다.');
    setForm(excludeForm);
  };

  const handleFinalSave = async () => {
    if (!selectedEmp) {
      alert('면담 대상 사원을 선택해주세요.');
      return;
    }
    if (!hasFormContent(form)) {
      alert('주요 면담 내용을 입력해 주세요.');
      return;
    }
    await upsertInterviewRecord(selectedEmp, form, '저장완료', '면담 기록이 저장되었습니다.');
  };

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

  const renderInterviewSummary = () => (
    <section className="interview-summary-bar">
      <div className="summary-header">
        <div>
          <h2 className="summary-title">면담기록 현황</h2>
          <div className="summary-badges">
            {!interviewTableReady && (
              <span className="db-badge error">⚠️ team_interview 테이블 필요</span>
            )}
            {saveStatus === 'saving' && (
              <span className="db-badge loading">💾 저장 중...</span>
            )}
          </div>
        </div>
        <span className="summary-total">전체 {employees.length}명</span>
      </div>
      <div className="summary-stats">
        <div className="summary-stat stat-empty">
          <div className="summary-stat-label">미입력</div>
          <div className="summary-stat-value">{summaryStats.미입력}</div>
        </div>
        <div className="summary-stat stat-draft">
          <div className="summary-stat-label">작성중</div>
          <div className="summary-stat-value">{summaryStats.작성중}</div>
        </div>
        <div className="summary-stat stat-saved">
          <div className="summary-stat-label">저장완료</div>
          <div className="summary-stat-value">{summaryStats.저장완료}</div>
        </div>
        <div className="summary-stat stat-excluded">
          <div className="summary-stat-label">대상외</div>
          <div className="summary-stat-value">{summaryStats.대상외}</div>
        </div>
      </div>
    </section>
  );

  const renderInterviewForm = () => {
    if (!selectedEmp) {
      return (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h3 className="empty-state-title">면담 대상을 선택하세요</h3>
          <p className="empty-state-text">
            왼쪽 목록에서 사원을 선택하면 면담 기록을 작성할 수 있습니다.
          </p>
        </div>
      );
    }

    const currentStatus = getStatusForEmployee(selectedEmp);

    return (
      <section className="form-card">
        <div className="form-card-header">
          <div>
            <h3 className="form-card-title">{selectedEmp.name}</h3>
            <p className="form-card-subtitle">
              {selectedEmp.position} · {selectedEmp.department} · 사번 {selectedEmp.displayId}
            </p>
          </div>
          <span className={`interview-status ${getStatusClass(currentStatus)}`}>
            {currentStatus}
          </span>
        </div>

        <div className="form-grid">
          <div className="form-field">
            {renderFormFieldHeader('면담일자', 'date', form.date, 'interview-date')}
            <input
              id="interview-date"
              type="date"
              className="form-input"
              value={form.date}
              onChange={(e) => updateFormField('date', e.target.value)}
            />
          </div>
          <div className="form-field">
            {renderFormFieldHeader('면담목적', 'purpose', form.purpose, 'interview-purpose')}
            <input
              id="interview-purpose"
              type="text"
              className="form-input"
              value={form.purpose}
              onChange={(e) => updateFormField('purpose', e.target.value)}
              placeholder="정기면담"
            />
          </div>
          <div className="form-field full">
            {renderFormFieldHeader('주요 면담 내용', 'content', form.content, 'interview-content')}
            <textarea
              id="interview-content"
              className="form-textarea"
              value={form.content}
              onChange={(e) => updateFormField('content', e.target.value)}
              placeholder="면담 내용을 입력하세요"
            />
          </div>
          <div className="form-field full">
            {renderFormFieldHeader('피드백 및 조치', 'feedback', form.feedback, 'interview-feedback')}
            <textarea
              id="interview-feedback"
              className="form-textarea"
              value={form.feedback}
              onChange={(e) => updateFormField('feedback', e.target.value)}
              placeholder="피드백 및 후속 조치 사항"
            />
          </div>
          <div className="form-field full">
            {renderFormFieldHeader('제안 및 민원', 'complaints', form.complaints, 'interview-complaints')}
            <textarea
              id="interview-complaints"
              className="form-textarea"
              value={form.complaints}
              onChange={(e) => updateFormField('complaints', e.target.value)}
              placeholder="제안사항 또는 민원 내용"
            />
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="form-btn draft"
            onClick={() => void handleDraftSave()}
            disabled={saveStatus === 'saving'}
          >
            작성중
          </button>
          <button
            type="button"
            className="form-btn exclude"
            onClick={() => void handleExcludeSave()}
            disabled={saveStatus === 'saving'}
          >
            대상외
          </button>
          <button
            type="button"
            className="form-btn save"
            onClick={() => void handleFinalSave()}
            disabled={saveStatus === 'saving'}
          >
            저장하기
          </button>
        </div>
      </section>
    );
  };

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <LeaderPageNav activePage={activePage} onNavigate={onNavigate} />
          <p className="sidebar-subtitle">팀장 면담 기록 대시보드</p>
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
            placeholder="이름, 사번, 소속 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-tabs">
          <button
            type="button"
            className={`filter-tab${deptFilter === 'all' ? ' active' : ''}`}
            onClick={() => setDeptFilter('all')}
          >
            전체
          </button>
          {departments.map((dept) => (
            <button
              key={dept}
              type="button"
              className={`filter-tab${deptFilter === dept ? ' active' : ''}`}
              onClick={() => setDeptFilter(dept)}
            >
              {dept}
            </button>
          ))}
        </div>

        <div className="employee-list">
          {dataLoading && <div className="loading-overlay">구성원 목록 불러오는 중...</div>}
          {dataError && !dataLoading && (
            <div className="sidebar-empty" style={{ color: '#b91c1c' }}>
              {dataError}
            </div>
          )}
          {!dataLoading && !dataError && groupedEmployees.length === 0 && (
            <div className="sidebar-empty">표시할 구성원이 없습니다.</div>
          )}
          {!dataLoading &&
            groupedEmployees.map(({ department, members }) => (
              <div key={department} className="dept-group">
                <div className="dept-group-title">{department}</div>
                {members.map((emp) => {
                  const status = getStatusForEmployee(emp as Employee);
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      className={`employee-item status-${getStatusClass(status)}${selectedEmpId === emp.id ? ' selected' : ''}`}
                      onClick={() => selectEmployee(emp as Employee)}
                    >
                      <div className="employee-item-left">
                        <div className="employee-name">{emp.name}</div>
                        <div className="employee-meta">
                          {emp.position} · {(emp as Employee).displayId}
                        </div>
                      </div>
                      <div className="employee-item-right">
                        <span className={`interview-status ${getStatusClass(status)}`}>
                          {status}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
        </div>
      </aside>

      <main className="main-content">
        {renderInterviewSummary()}
        <div className="form-panel" ref={formPanelRef}>
          {renderInterviewForm()}
        </div>
      </main>
    </div>
  );
}
