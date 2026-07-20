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
  type InterviewHistoryEntry,
  type InterviewRecord,
  type InterviewStatus,
  type ComplaintStatus,
  INTERVIEW_PURPOSE_OPTIONS,
  COMPLAINT_STATUS_OPTIONS,
  archiveInterviewToHistory,
  createFreshInterviewForm,
  deleteInterviewHistoryEntry,
  fetchInterviewHistoryForEmployee,
  fetchInterviewsFromSupabase,
  getEmployeeDbKey,
  hasComplaintsContent,
  hasInterviewContent,
  getUtf8ByteLength,
  INTERVIEW_TEXT_MAX_BYTES,
  truncateToUtf8MaxBytes,
  isMissingHistoryTableError,
  isMissingTableError,
  normalizeComplaintStatus,
  normalizeInterviewPurpose,
  preserveComplaintFields,
  saveInterviewToSupabase,
  shouldShowComplaintBadge,
  updateInterviewHistoryEntry,
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

const DEFAULT_FORM: InterviewForm = createFreshInterviewForm();

const RESET_FORM: InterviewForm = {
  date: '',
  purpose: '',
  content: '',
  feedback: '',
  complaints: '',
  complaintStatus: '',
};

const hasFormContent = (form: InterviewForm): boolean => hasInterviewContent(form);

const formatHistoryDate = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getHistoryPreview = (form: InterviewForm): string => {
  const text = form.content.trim() || form.feedback.trim() || form.complaints.trim();
  if (!text) return '내용 없음';
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
};

const getStatusClass = (status: InterviewStatus): string => {
  switch (status) {
    case '면담완료':
      return 'completed';
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

const getComplaintStatusClass = (status: ComplaintStatus | ''): string => {
  switch (status) {
    case '진행중':
      return 'in-progress';
    case '완료':
      return 'done';
    case '표시안함':
      return 'hidden';
    default:
      return 'review';
  }
};

const getActiveComplaintStatus = (status: ComplaintStatus | ''): ComplaintStatus =>
  normalizeComplaintStatus(status) || '확인';

const getComplaintInfoForEmployee = (
  emp: Employee,
  selectedEmpId: string | null,
  currentForm: InterviewForm,
  getRecordForEmployee: (emp: Employee) => InterviewRecord | undefined
): { showBadge: boolean; complaintStatus: ComplaintStatus | '' } => {
  const form =
    selectedEmpId === emp.id
      ? currentForm
      : getRecordForEmployee(emp)?.form ?? createFreshInterviewForm();

  return {
    showBadge: shouldShowComplaintBadge(form),
    complaintStatus: normalizeComplaintStatus(form.complaintStatus),
  };
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
  const [interviewHistory, setInterviewHistory] = useState<InterviewHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyTableReady, setHistoryTableReady] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyDeletingId, setHistoryDeletingId] = useState<string | null>(null);
  const [loadedHistoryEntryId, setLoadedHistoryEntryId] = useState<string | null>(null);
  const [historySaveModalOpen, setHistorySaveModalOpen] = useState(false);
  const formPanelRef = useRef<HTMLDivElement>(null);
  const historySaveChoiceRef = useRef<((choice: 'overwrite' | 'append' | null) => void) | null>(
    null
  );

  const promptHistorySaveChoice = useCallback(
    (): Promise<'overwrite' | 'append' | null> =>
      new Promise((resolve) => {
        historySaveChoiceRef.current = resolve;
        setHistorySaveModalOpen(true);
      }),
    []
  );

  const closeHistorySaveModal = useCallback((choice: 'overwrite' | 'append' | null) => {
    setHistorySaveModalOpen(false);
    historySaveChoiceRef.current?.(choice);
    historySaveChoiceRef.current = null;
  }, []);

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
    (emp: Employee): InterviewStatus => getRecordForEmployee(emp)?.status ?? '미면담',
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
      미면담: 0,
      면담완료: 0,
      작성중: 0,
      저장완료: 0,
      대상외: 0,
    };
    employees.forEach((emp) => {
      counts[getStatusForEmployee(emp)] += 1;
    });
    return counts;
  }, [employees, getStatusForEmployee]);

  const loadInterviewHistory = useCallback(async (emp: Employee) => {
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const entries = await fetchInterviewHistoryForEmployee(emp);
      setInterviewHistory(entries);
      setHistoryTableReady(true);
    } catch (err: unknown) {
      if (isMissingHistoryTableError(err as { code?: string; message?: string })) {
        setInterviewHistory([]);
        setHistoryTableReady(false);
      } else {
        const message =
          err instanceof Error ? err.message : '지난 면담 기록을 불러오지 못했습니다.';
        setHistoryError(message);
        setInterviewHistory([]);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const selectEmployee = (emp: Employee) => {
    setSelectedEmpId(emp.id);
    setLoadedHistoryEntryId(null);
    const record = getRecordForEmployee(emp);
    if (
      record &&
      (record.status === '작성중' || record.status === '면담완료') &&
      (record.status === '면담완료' || hasFormContent(record.form))
    ) {
      setForm({
        ...record.form,
        purpose: normalizeInterviewPurpose(record.form.purpose),
      });
    } else {
      const freshForm = createFreshInterviewForm();
      setForm(record?.form ? preserveComplaintFields(freshForm, record.form) : freshForm);
    }
    setHistoryExpanded(false);
    void loadInterviewHistory(emp);
  };

  useEffect(() => {
    if (!selectedEmpId) return;
    formPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectedEmpId]);

  const updateFormField = <K extends keyof InterviewForm>(key: K, value: InterviewForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateLimitedTextField = (key: 'content' | 'feedback', value: string) => {
    updateFormField(key, truncateToUtf8MaxBytes(value, INTERVIEW_TEXT_MAX_BYTES));
  };

  const renderByteCounter = (value: string) => {
    const bytes = getUtf8ByteLength(value);
    const isOverLimit = bytes > INTERVIEW_TEXT_MAX_BYTES;

    return (
      <span
        className={`form-byte-counter${isOverLimit ? ' over-limit' : ''}`}
        aria-live="polite"
      >
        {bytes} / {INTERVIEW_TEXT_MAX_BYTES} byte
      </span>
    );
  };

  const renderLimitedFormFieldHeader = (
    label: string,
    fieldKey: string,
    value: string,
    htmlFor: string
  ) => (
    <div className="form-label-row">
      <div className="form-label-group">
        <label className="form-label" htmlFor={htmlFor}>
          {label}
        </label>
        {renderByteCounter(value)}
      </div>
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

  const renderComplaintsFieldHeader = () => {
    const activeStatus = getActiveComplaintStatus(form.complaintStatus);
    const canSetStatus = hasComplaintsContent(form);

    return (
      <div className="form-label-row">
        <div className="form-label-group">
          <label className="form-label" htmlFor="interview-complaints">
            피평가자의 건의, 제안, 민원
          </label>
          <div className="complaint-status-options" role="group" aria-label="건의 사항 진행 상태">
            {COMPLAINT_STATUS_OPTIONS.map((status) => (
              <button
                key={status}
                type="button"
                className={`complaint-status-btn status-${getComplaintStatusClass(status)}${activeStatus === status ? ' active' : ''}`}
                onClick={() => void handleComplaintStatusChange(status)}
                disabled={!canSetStatus || saveStatus === 'saving'}
                aria-pressed={activeStatus === status}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className={`form-copy-btn${copiedField === 'complaints' ? ' copied' : ''}`}
          onClick={() => void copyFieldValue('complaints', form.complaints)}
          disabled={!form.complaints.trim()}
        >
          {copiedField === 'complaints' ? '복사됨' : '복사'}
        </button>
      </div>
    );
  };

  const handleComplaintStatusChange = async (status: ComplaintStatus) => {
    if (!selectedEmp || !hasComplaintsContent(form)) {
      return;
    }

    const nextForm = { ...form, complaintStatus: status };
    setForm(nextForm);
    await upsertInterviewRecord(selectedEmp, nextForm, getStatusForEmployee(selectedEmp));
  };

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

  const handleResetForm = async () => {
    if (!selectedEmp) {
      alert('면담 대상 사원을 선택해주세요.');
      return;
    }

    const resetForm: InterviewForm = { ...RESET_FORM };
    await upsertInterviewRecord(
      selectedEmp,
      resetForm,
      '미면담',
      '면담 기록이 초기화되었습니다.'
    );
    setForm(resetForm);
    setLoadedHistoryEntryId(null);
  };

  const handleInterviewComplete = async () => {
    if (!selectedEmp) {
      alert('면담 대상 사원을 선택해주세요.');
      return;
    }

    const completedForm: InterviewForm = {
      ...form,
      date: form.date || new Date().toISOString().split('T')[0],
    };
    await upsertInterviewRecord(
      selectedEmp,
      completedForm,
      '면담완료',
      '면담 완료로 표시되었습니다. 이어서 면담 기록을 작성해 주세요.'
    );
    setForm(completedForm);
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
      alert('피드백 내용을 입력해 주세요.');
      return;
    }

    let overwriteLoadedHistory = false;
    const hadLoadedHistory = loadedHistoryEntryId !== null;
    if (loadedHistoryEntryId) {
      const choice = await promptHistorySaveChoice();
      if (!choice) {
        return;
      }
      overwriteLoadedHistory = choice === 'overwrite';
    }

    const savedForm = { ...form };
    const clearedForm = preserveComplaintFields(createFreshInterviewForm(), savedForm);
    setSaveStatus('saving');

    try {
      let archived = false;
      try {
        if (loadedHistoryEntryId && overwriteLoadedHistory) {
          await updateInterviewHistoryEntry(
            loadedHistoryEntryId,
            selectedEmp,
            savedForm,
            '저장완료'
          );
          archived = true;
        } else {
          await archiveInterviewToHistory(selectedEmp, savedForm, '저장완료');
          archived = true;
        }
        setHistoryTableReady(true);
      } catch (err: unknown) {
        if (!isMissingHistoryTableError(err as { code?: string; message?: string })) {
          throw err;
        }
        setHistoryTableReady(false);
      }

      await saveInterviewToSupabase(
        selectedEmp,
        archived ? clearedForm : savedForm,
        '저장완료'
      );
      setInterviewRecords((prev) => ({
        ...prev,
        [getEmployeeDbKey(selectedEmp)]: {
          form: archived ? { ...clearedForm } : { ...savedForm },
          status: '저장완료',
        },
      }));
      setInterviewTableReady(true);
      setForm(clearedForm);
      setLoadedHistoryEntryId(null);
      setHistoryExpanded(false);
      setSaveStatus('idle');
      await loadInterviewHistory(selectedEmp);
      alert(
        hadLoadedHistory && overwriteLoadedHistory
          ? '기존 면담 기록을 덮어썼습니다.'
          : hadLoadedHistory
            ? '새 면담 기록으로 저장했습니다.'
            : '면담 기록이 저장되었습니다.'
      );
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

  const handleDeleteHistoryEntry = async (entry: InterviewHistoryEntry) => {
    if (!selectedEmp) {
      return;
    }

    const confirmed = window.confirm(
      `${entry.form.date || '일자 미입력'} · ${entry.form.purpose} 면담 기록을 삭제할까요?\n삭제 후 복구할 수 없습니다.`
    );
    if (!confirmed) {
      return;
    }

    setHistoryDeletingId(entry.id);
    try {
      await deleteInterviewHistoryEntry(entry.id);
      setInterviewHistory((prev) => prev.filter((item) => item.id !== entry.id));
    } catch (err: unknown) {
      if (isMissingHistoryTableError(err as { code?: string; message?: string })) {
        setHistoryTableReady(false);
        alert('이력 테이블이 없어 삭제할 수 없습니다.');
      } else {
        const message = err instanceof Error ? err.message : '면담 기록 삭제에 실패했습니다.';
        alert(message);
      }
    } finally {
      setHistoryDeletingId(null);
    }
  };

  const handleLoadHistoryEntry = (entry: InterviewHistoryEntry) => {
    if (hasFormContent(form)) {
      const confirmed = window.confirm(
        '현재 작성 중인 내용이 있습니다. 선택한 지난 면담 내용으로 덮어쓸까요?'
      );
      if (!confirmed) return;
    }

    setForm({
      ...entry.form,
      purpose: normalizeInterviewPurpose(entry.form.purpose),
    });
    setLoadedHistoryEntryId(entry.id);
    setHistoryExpanded(false);
  };

  const handleRefresh = async () => {
    setActionLoading(true);
    await loadData();
    if (selectedEmp) {
      await loadInterviewHistory(selectedEmp);
    }
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
          <h2 className="summary-title">면담 기록 현황</h2>
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
          <div className="summary-stat-label">미면담</div>
          <div className="summary-stat-value">{summaryStats.미면담}</div>
        </div>
        <div className="summary-stat stat-completed">
          <div className="summary-stat-label">면담 완료</div>
          <div className="summary-stat-value">{summaryStats.면담완료}</div>
        </div>
        <div className="summary-stat stat-draft">
          <div className="summary-stat-label">작성 중</div>
          <div className="summary-stat-value">{summaryStats.작성중}</div>
        </div>
        <div className="summary-stat stat-saved">
          <div className="summary-stat-label">저장 완료</div>
          <div className="summary-stat-value">{summaryStats.저장완료}</div>
        </div>
        <div className="summary-stat stat-excluded">
          <div className="summary-stat-label">대상 외</div>
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
          <div className="form-card-identity-grid">
            <div className="form-card-title-group">
              <h3 className="form-card-title">{selectedEmp.name}</h3>
              <span className={`interview-status ${getStatusClass(currentStatus)}`}>
                {currentStatus}
              </span>
            </div>
            <p className="form-card-subtitle">
              {selectedEmp.position} · {selectedEmp.department} · 사번 {selectedEmp.displayId}
            </p>
          </div>

          {!historyTableReady && (
            <p className="interview-history-note warning">
              이력 테이블이 없습니다. Supabase에서{' '}
              <code>supabase/migrations/006_create_team_interview_history.sql</code>을 실행하면
              지난 면담을 보관·불러올 수 있습니다.
            </p>
          )}
        </div>

        <div className="form-grid">
          <div className="form-field">
            {renderFormFieldHeader('면담 일자', 'date', form.date, 'interview-date')}
            <input
              id="interview-date"
              type="date"
              className="form-input"
              value={form.date}
              onChange={(e) => updateFormField('date', e.target.value)}
            />
          </div>
          <div className="form-field">
            {renderFormFieldHeader('면담 목적', 'purpose', form.purpose, 'interview-purpose')}
            <select
              id="interview-purpose"
              className="form-select"
              value={normalizeInterviewPurpose(form.purpose)}
              onChange={(e) => updateFormField('purpose', e.target.value)}
            >
              {INTERVIEW_PURPOSE_OPTIONS.map((purpose) => (
                <option key={purpose} value={purpose}>
                  {purpose}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field full">
            {renderLimitedFormFieldHeader(
              '피드백 내용',
              'content',
              form.content,
              'interview-content'
            )}
            <textarea
              id="interview-content"
              className="form-textarea"
              value={form.content}
              onChange={(e) => updateLimitedTextField('content', e.target.value)}
              placeholder="피드백 내용을 입력하세요"
            />
          </div>
          <div className="form-field full">
            {renderLimitedFormFieldHeader(
              '피평가자에 대한 개선 요청 사항',
              'feedback',
              form.feedback,
              'interview-feedback'
            )}
            <textarea
              id="interview-feedback"
              className="form-textarea"
              value={form.feedback}
              onChange={(e) => updateLimitedTextField('feedback', e.target.value)}
              placeholder="피평가자에 대한 개선 요청 사항"
            />
          </div>
          <div className="form-field full">
            {renderComplaintsFieldHeader()}
            <textarea
              id="interview-complaints"
              className="form-textarea"
              value={form.complaints}
              onChange={(e) => {
                const complaints = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  complaints,
                  complaintStatus: complaints.trim()
                    ? prev.complaintStatus || '확인'
                    : '',
                }));
              }}
              placeholder="피평가자의 건의, 제안, 민원"
            />
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="form-btn reset"
            onClick={() => void handleResetForm()}
            disabled={saveStatus === 'saving'}
          >
            초기화
          </button>
          <button
            type="button"
            className="form-btn complete"
            onClick={() => void handleInterviewComplete()}
            disabled={saveStatus === 'saving'}
          >
            면담 완료
          </button>
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
            className="form-btn save"
            onClick={() => void handleFinalSave()}
            disabled={saveStatus === 'saving'}
          >
            저장하기
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
            className="form-btn history"
            onClick={() => setHistoryExpanded((prev) => !prev)}
            aria-expanded={historyExpanded}
            disabled={saveStatus === 'saving'}
          >
            {historyExpanded ? '지난 면담 접기' : '지난 면담 불러오기'}
          </button>
        </div>

        {historyExpanded && (
          <section className="interview-history-panel interview-history-panel-actions">
            <p className="interview-history-desc">
              저장된 지난 면담 기록을 선택하면 위 작성란에 불러옵니다.
            </p>
            {historyLoading && (
              <p className="interview-history-empty">지난 면담 기록을 불러오는 중...</p>
            )}
            {!historyLoading && historyError && (
              <p className="interview-history-empty error">{historyError}</p>
            )}
            {!historyLoading && !historyError && interviewHistory.length === 0 && (
              <p className="interview-history-empty">불러올 지난 면담 기록이 없습니다.</p>
            )}
            {!historyLoading && !historyError && interviewHistory.length > 0 && (
              <ul className="interview-history-list">
                {interviewHistory.map((entry) => (
                  <li key={entry.id} className="interview-history-list-item">
                    <button
                      type="button"
                      className="interview-history-item"
                      onClick={() => handleLoadHistoryEntry(entry)}
                      disabled={historyDeletingId === entry.id}
                    >
                      <div className="interview-history-item-top">
                        <span className="interview-history-purpose">{entry.form.purpose}</span>
                        <span className="interview-history-date">
                          {entry.form.date || '일자 미입력'}
                        </span>
                      </div>
                      <p className="interview-history-preview">{getHistoryPreview(entry.form)}</p>
                      <span className="interview-history-meta">
                        저장 {formatHistoryDate(entry.savedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="interview-history-delete-btn"
                      onClick={() => void handleDeleteHistoryEntry(entry)}
                      disabled={historyDeletingId === entry.id}
                      aria-label={`${entry.form.purpose} 면담 기록 삭제`}
                    >
                      {historyDeletingId === entry.id ? '삭제 중' : '삭제'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
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
                  const complaintInfo = getComplaintInfoForEmployee(
                    emp as Employee,
                    selectedEmpId,
                    form,
                    getRecordForEmployee
                  );

                  return (
                    <button
                      key={emp.id}
                      type="button"
                      className={`employee-item status-${getStatusClass(status)}${selectedEmpId === emp.id ? ' selected' : ''}`}
                      onClick={() => selectEmployee(emp as Employee)}
                    >
                      <div className="employee-item-left">
                        <div className="employee-name-row">
                          <div className="employee-name">{emp.name}</div>
                          {complaintInfo.showBadge ? (
                            <span
                              className={`employee-complaint-badge status-${getComplaintStatusClass(complaintInfo.complaintStatus)}`}
                              title={`건의 사항 ${getActiveComplaintStatus(complaintInfo.complaintStatus)}`}
                            >
                              건의
                            </span>
                          ) : null}
                        </div>
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

      {historySaveModalOpen && (
        <div
          className="interview-save-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="interview-save-modal-title"
          onClick={() => closeHistorySaveModal(null)}
        >
          <div className="interview-save-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="interview-save-modal-title" className="interview-save-modal-title">
              지난 면담 기록 저장
            </h2>
            <p className="interview-save-modal-message">
              지난 면담 기록을 불러와 수정했습니다.
            </p>
            <div className="interview-save-modal-actions">
              <button
                type="button"
                className="form-btn save"
                onClick={() => closeHistorySaveModal('overwrite')}
              >
                확인
              </button>
              <button
                type="button"
                className="form-btn history"
                onClick={() => closeHistorySaveModal('append')}
              >
                추가
              </button>
            </div>
            <p className="interview-save-modal-hint">
              확인: 기존 면담에 덮어쓰기 · 추가: 새 면담으로 저장
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
