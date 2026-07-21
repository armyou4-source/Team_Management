import iconv from 'iconv-lite';
import { supabase } from './supabaseClient';

export type InterviewStatus = '미면담' | '면담완료' | '작성중' | '저장완료' | '대상외';

export const INTERVIEW_PURPOSE_OPTIONS = ['중간평가', '성과평가', '수시면담'] as const;
export type InterviewPurpose = (typeof INTERVIEW_PURPOSE_OPTIONS)[number];

export const COMPLAINT_STATUS_OPTIONS = ['확인', '진행중', '완료', '표시안함'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUS_OPTIONS)[number];

export const DEFAULT_INTERVIEW_PURPOSE: InterviewPurpose = '중간평가';
export const DEFAULT_COMPLAINT_STATUS: ComplaintStatus = '확인';
export const HIDDEN_COMPLAINT_STATUS: ComplaintStatus = '표시안함';

export interface InterviewForm {
  date: string;
  purpose: string;
  content: string;
  feedback: string;
  complaints: string;
  complaintStatus: ComplaintStatus | '';
}

export interface InterviewHistoryEntry {
  id: string;
  form: InterviewForm;
  status: InterviewStatus;
  savedAt: string;
  source: 'history' | 'current';
}

export interface InterviewRecord {
  form: InterviewForm;
  status: InterviewStatus;
}

export interface EmployeeRef {
  id: string;
  name: string;
  position: string;
  department: string;
}

export interface TeamInterviewRow {
  사번: string;
  성명: string | null;
  직급: string | null;
  소속: string | null;
  면담일자: string | null;
  면담목적: string | null;
  주요면담내용: string | null;
  피드백조치: string | null;
  제안민원: string | null;
  건의상태: ComplaintStatus | null;
  상태: InterviewStatus;
  updated_at?: string;
}

interface TeamInterviewHistoryRow extends TeamInterviewRow {
  id: string;
  saved_at: string;
}

export const normalizeInterviewPurpose = (purpose: string | null | undefined): string => {
  if (purpose && INTERVIEW_PURPOSE_OPTIONS.includes(purpose as InterviewPurpose)) {
    return purpose;
  }
  return DEFAULT_INTERVIEW_PURPOSE;
};

/** 과거 DB 값 '미입력'을 현재 상태명 '미면담'으로 보정 */
export const normalizeInterviewStatus = (
  status: string | null | undefined
): InterviewStatus => {
  if (status === '미입력') return '미면담';
  if (
    status === '미면담' ||
    status === '면담완료' ||
    status === '작성중' ||
    status === '저장완료' ||
    status === '대상외'
  ) {
    return status;
  }
  return '미면담';
};

export const normalizeComplaintStatus = (
  status: string | null | undefined
): ComplaintStatus | '' => {
  if (status && COMPLAINT_STATUS_OPTIONS.includes(status as ComplaintStatus)) {
    return status as ComplaintStatus;
  }
  return '';
};

export const hasComplaintsContent = (form: InterviewForm): boolean =>
  Boolean(form.complaints.trim());

export const shouldShowComplaintBadge = (form: InterviewForm): boolean => {
  if (!hasComplaintsContent(form)) return false;
  const status = normalizeComplaintStatus(form.complaintStatus) || DEFAULT_COMPLAINT_STATUS;
  return status !== HIDDEN_COMPLAINT_STATUS;
};

export const preserveComplaintFields = (
  target: InterviewForm,
  source: InterviewForm
): InterviewForm => ({
  ...target,
  complaints: source.complaints,
  complaintStatus: source.complaints.trim()
    ? source.complaintStatus || DEFAULT_COMPLAINT_STATUS
    : '',
});

export const getEmployeeDbKey = (emp: EmployeeRef): string => {
  const rowMatch = emp.id.match(/-(\d+)-/);
  const rowNum = rowMatch ? rowMatch[1] : '';
  const sheetMatch = emp.id.match(/excel-([^-]+)-/);
  const sheetName = sheetMatch ? sheetMatch[1] : '일반';
  return emp.id.startsWith('excel-')
    ? `${sheetName.substring(0, 2)}-${rowNum}-${emp.name}`
    : emp.id;
};

export const mapRowToForm = (
  row: Pick<
    TeamInterviewRow,
    '면담일자' | '면담목적' | '주요면담내용' | '피드백조치' | '제안민원' | '건의상태'
  >
): InterviewForm => {
  const complaints = row.제안민원 ?? '';
  const complaintStatus = normalizeComplaintStatus(row.건의상태);

  return {
    date: row.면담일자 ?? new Date().toISOString().split('T')[0],
    purpose: normalizeInterviewPurpose(row.면담목적),
    content: row.주요면담내용 ?? '',
    feedback: row.피드백조치 ?? '',
    complaints,
    complaintStatus: complaints.trim()
      ? complaintStatus || DEFAULT_COMPLAINT_STATUS
      : '',
  };
};

export const mapRowToRecord = (row: TeamInterviewRow): InterviewRecord => ({
  form: mapRowToForm(row),
  status: normalizeInterviewStatus(row.상태),
});

export const mapHistoryRowToEntry = (row: TeamInterviewHistoryRow): InterviewHistoryEntry => ({
  id: row.id,
  form: mapRowToForm(row),
  status: normalizeInterviewStatus(row.상태),
  savedAt: row.saved_at,
  source: 'history',
});

export const buildInterviewPayload = (
  emp: EmployeeRef,
  form: InterviewForm,
  status: InterviewStatus
): TeamInterviewRow => ({
  사번: getEmployeeDbKey(emp),
  성명: emp.name,
  직급: emp.position,
  소속: emp.department,
  면담일자: form.date || null,
  면담목적: form.purpose || null,
  주요면담내용: form.content || null,
  피드백조치: form.feedback || null,
  제안민원: form.complaints || null,
  건의상태: form.complaints.trim()
    ? form.complaintStatus || DEFAULT_COMPLAINT_STATUS
    : null,
  상태: status,
});

export const fetchInterviewsFromSupabase = async (): Promise<Record<string, InterviewRecord>> => {
  const { data, error } = await supabase.from('team_interview').select('*');

  if (error) {
    throw error;
  }

  const records: Record<string, InterviewRecord> = {};
  (data as TeamInterviewRow[] | null)?.forEach((row) => {
    records[row.사번] = mapRowToRecord(row);
  });

  return records;
};

export const saveInterviewToSupabase = async (
  emp: EmployeeRef,
  form: InterviewForm,
  status: InterviewStatus
): Promise<void> => {
  const payload = buildInterviewPayload(emp, form, status);
  const { error } = await supabase
    .from('team_interview')
    .upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: '사번' });

  if (error) {
    throw error;
  }
};

export const isMissingTableError = (error: { code?: string; message?: string }): boolean =>
  error.code === 'PGRST205' || (error.message?.includes('team_interview') ?? false);

export const isMissingHistoryTableError = (error: { code?: string; message?: string }): boolean =>
  error.code === 'PGRST205' || (error.message?.includes('team_interview_history') ?? false);

export const fetchInterviewHistoryForEmployee = async (
  emp: EmployeeRef
): Promise<InterviewHistoryEntry[]> => {
  const employeeKey = getEmployeeDbKey(emp);

  const { data, error } = await supabase
    .from('team_interview_history')
    .select('*')
    .eq('사번', employeeKey)
    .order('saved_at', { ascending: false });

  if (error) {
    if (isMissingHistoryTableError(error)) {
      return [];
    }
    throw error;
  }

  return (data as TeamInterviewHistoryRow[] | null)?.map(mapHistoryRowToEntry) ?? [];
};

export const hasInterviewContent = (form: InterviewForm): boolean =>
  Boolean(form.content.trim() || form.feedback.trim() || form.complaints.trim());

export const INTERVIEW_TEXT_MAX_BYTES = 500;

export const INTERVIEW_BLOCKED_SPECIAL_CHAR_PATTERN = /[!@#$%^&{}\\?/+]/;
export const INTERVIEW_BLOCKED_SPECIAL_CHAR_REGEX = /[!@#$%^&{}\\?/+]/g;

export const sanitizeInterviewTextInput = (
  value: string
): { sanitized: string; hadBlockedChars: boolean } => {
  const hadBlockedChars = INTERVIEW_BLOCKED_SPECIAL_CHAR_PATTERN.test(value);
  const sanitized = value.replace(INTERVIEW_BLOCKED_SPECIAL_CHAR_REGEX, '');
  return { sanitized, hadBlockedChars };
};

export const sanitizeInterviewLimitedFields = (form: InterviewForm): InterviewForm => ({
  ...form,
  content: sanitizeInterviewTextInput(form.content).sanitized,
  feedback: sanitizeInterviewTextInput(form.feedback).sanitized,
});

/** 붙여넣기 대상(Windows CP949/EUC-KR)과 동일한 byte 길이 */
export const getCp949ByteLength = (value: string): number =>
  iconv.encode(value, 'cp949').length;

export const truncateToCp949MaxBytes = (value: string, maxBytes: number): string => {
  if (getCp949ByteLength(value) <= maxBytes) return value;

  let result = '';
  let byteLength = 0;
  for (const char of value) {
    const charBytes = getCp949ByteLength(char);
    if (byteLength + charBytes > maxBytes) break;
    result += char;
    byteLength += charBytes;
  }
  return result;
};

export const archiveInterviewToHistory = async (
  emp: EmployeeRef,
  form: InterviewForm,
  status: InterviewStatus
): Promise<void> => {
  const payload = buildInterviewPayload(emp, form, status);
  const { error } = await supabase.from('team_interview_history').insert({
    ...payload,
    saved_at: new Date().toISOString(),
  });

  if (error) {
    throw error;
  }
};

export const updateInterviewHistoryEntry = async (
  id: string,
  emp: EmployeeRef,
  form: InterviewForm,
  status: InterviewStatus
): Promise<void> => {
  const payload = buildInterviewPayload(emp, form, status);
  const { error } = await supabase
    .from('team_interview_history')
    .update({
      ...payload,
      saved_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    throw error;
  }
};

export const syncComplaintStatusToHistory = async (
  emp: EmployeeRef,
  complaints: string,
  complaintStatus: ComplaintStatus | ''
): Promise<number> => {
  const trimmedComplaints = complaints.trim();
  if (!trimmedComplaints) {
    return 0;
  }

  const normalizedStatus = normalizeComplaintStatus(complaintStatus) || DEFAULT_COMPLAINT_STATUS;
  const employeeKey = getEmployeeDbKey(emp);

  const { data, error: fetchError } = await supabase
    .from('team_interview_history')
    .select('*')
    .eq('사번', employeeKey);

  if (fetchError) {
    throw fetchError;
  }

  const matchingIds =
    (data as TeamInterviewHistoryRow[] | null)
      ?.filter((row) => (row.제안민원 ?? '').trim() === trimmedComplaints)
      .map((row) => row.id) ?? [];

  if (matchingIds.length === 0) {
    return 0;
  }

  const { error } = await supabase
    .from('team_interview_history')
    .update({ 건의상태: normalizedStatus })
    .in('id', matchingIds);

  if (error) {
    throw error;
  }

  return matchingIds.length;
};

export const deleteInterviewHistoryEntry = async (id: string): Promise<void> => {
  const { error } = await supabase.from('team_interview_history').delete().eq('id', id);

  if (error) {
    throw error;
  }
};

export const createFreshInterviewForm = (): InterviewForm => ({
  date: new Date().toISOString().split('T')[0],
  purpose: DEFAULT_INTERVIEW_PURPOSE,
  content: '',
  feedback: '',
  complaints: '',
  complaintStatus: '',
});
