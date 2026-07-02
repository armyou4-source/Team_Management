import { supabase } from './supabaseClient';

export type InterviewStatus = '미입력' | '작성중' | '저장완료' | '대상외';

export interface InterviewForm {
  date: string;
  purpose: string;
  content: string;
  feedback: string;
  complaints: string;
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
  상태: InterviewStatus;
  updated_at?: string;
}

export const getEmployeeDbKey = (emp: EmployeeRef): string => {
  const rowMatch = emp.id.match(/-(\d+)-/);
  const rowNum = rowMatch ? rowMatch[1] : '';
  const sheetMatch = emp.id.match(/excel-([^-]+)-/);
  const sheetName = sheetMatch ? sheetMatch[1] : '일반';
  return emp.id.startsWith('excel-')
    ? `${sheetName.substring(0, 2)}-${rowNum}-${emp.name}`
    : emp.id;
};

export const mapRowToRecord = (row: TeamInterviewRow): InterviewRecord => ({
  form: {
    date: row.면담일자 ?? new Date().toISOString().split('T')[0],
    purpose: row.면담목적 ?? '정기면담',
    content: row.주요면담내용 ?? '',
    feedback: row.피드백조치 ?? '',
    complaints: row.제안민원 ?? '',
  },
  status: row.상태,
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
