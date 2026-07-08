import { supabase } from './supabaseClient';

export const REPORT_CONFIRM_CODE = '1612';
export const DEFAULT_DEPARTMENT_NAME = '보도기술팀';

export const BROADCAST_MEDIA_OPTIONS = ['TV', '제1FM', '제2FM', 'DMB', 'Youtube'] as const;
export type BroadcastMediaOption = (typeof BROADCAST_MEDIA_OPTIONS)[number];

export const ACCIDENT_LOCATION_OPTIONS = [
  '뉴스센터_A 스튜디오',
  '뉴스센터_A 부조',
  '뉴스센터_B 스튜디오',
  '뉴스센터_B 부조',
  '뉴스센터_오픈스튜디오',
  '뉴스센터_UHD 중계부조',
  '뉴스센터_해설부스',
  '수기입력',
] as const;
export type AccidentLocationOption = (typeof ACCIDENT_LOCATION_OPTIONS)[number];
export const LOCATION_MANUAL_OPTION: AccidentLocationOption = '수기입력';

export const ACCIDENT_PROGRAM_OPTIONS = [
  '뉴스데스크',
  '뉴스투데이',
  '930 뉴스',
  '12시 뉴스',
  '뉴스외전',
  '5시 뉴스와 경제',
  '마감뉴스',
  'MBC 스포츠',
  '수기 입력',
] as const;
export type AccidentProgramOption = (typeof ACCIDENT_PROGRAM_OPTIONS)[number];
export const PROGRAM_MANUAL_OPTION: AccidentProgramOption = '수기 입력';

export interface AccidentReportForm {
  reportDate: string;
  departmentName: string;
  authorName: string;
  broadcastMedia: BroadcastMediaOption[];
  accidentDatetime: string;
  location: string;
  programName: string;
  workers: string;
  accidentSummary: string;
  accidentDetails: string;
  accidentCause: string;
  followUpActions: string;
  otherNotes: string;
  confirmCode: string;
}

export interface AccidentReportPayload {
  report_date: string;
  department_name: string;
  author_name: string;
  broadcast_media: string;
  accident_datetime: string;
  location: string;
  program_name: string;
  workers: string;
  accident_summary: string;
  accident_details: string;
  accident_cause: string;
  follow_up_actions: string;
  other_notes: string;
  accident_content: string;
  cause_and_measures: string;
}

export const createEmptyAccidentReportForm = (): AccidentReportForm => ({
  reportDate: '',
  departmentName: DEFAULT_DEPARTMENT_NAME,
  authorName: '',
  broadcastMedia: [],
  accidentDatetime: '',
  location: '',
  programName: '',
  workers: '',
  accidentSummary: '',
  accidentDetails: '',
  accidentCause: '',
  followUpActions: '',
  otherNotes: '',
  confirmCode: '',
});

const joinSections = (sections: string[]): string =>
  sections.map((section) => section.trim()).filter(Boolean).join('\n\n');

export const mapFormToPayload = (form: AccidentReportForm): AccidentReportPayload => {
  const accidentContent = joinSections([form.accidentSummary, form.accidentDetails]);
  const causeAndMeasures = joinSections([
    form.accidentCause,
    form.followUpActions,
    form.otherNotes,
  ]);

  return {
    report_date: form.reportDate.trim(),
    department_name: form.departmentName.trim(),
    author_name: form.authorName.trim(),
    broadcast_media: form.broadcastMedia.join(', '),
    accident_datetime: form.accidentDatetime.trim(),
    location: form.location.trim(),
    program_name: form.programName.trim(),
    workers: form.workers.trim(),
    accident_summary: form.accidentSummary.trim(),
    accident_details: form.accidentDetails.trim(),
    accident_cause: form.accidentCause.trim(),
    follow_up_actions: form.followUpActions.trim(),
    other_notes: form.otherNotes.trim(),
    accident_content: accidentContent,
    cause_and_measures: causeAndMeasures,
  };
};

export interface AccidentReportRecord {
  id: string;
  report_date: string | null;
  department_name: string | null;
  author_name: string;
  broadcast_media: string | null;
  accident_datetime: string;
  location: string | null;
  program_name: string;
  workers: string | null;
  accident_summary: string | null;
  accident_details: string | null;
  accident_cause: string | null;
  follow_up_actions: string | null;
  other_notes: string | null;
  created_at: string;
}

export const isConfirmCodeValid = (form: AccidentReportForm): boolean =>
  form.confirmCode === REPORT_CONFIRM_CODE;

export const hasAccidentReportFormContent = (form: AccidentReportForm): boolean => {
  const payload = mapFormToPayload(form);
  return Boolean(
    payload.report_date ||
      payload.author_name ||
      payload.accident_datetime ||
      payload.location ||
      payload.program_name ||
      payload.workers ||
      payload.accident_summary ||
      payload.accident_details ||
      payload.accident_cause ||
      payload.follow_up_actions ||
      payload.other_notes ||
      form.broadcastMedia.length > 0
  );
};

const parseBroadcastMedia = (value: string | null): BroadcastMediaOption[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is BroadcastMediaOption =>
      BROADCAST_MEDIA_OPTIONS.includes(item as BroadcastMediaOption)
    );
};

export type AccidentReportBodyFields = Pick<
  AccidentReportForm,
  | 'accidentSummary'
  | 'accidentDetails'
  | 'accidentCause'
  | 'followUpActions'
  | 'otherNotes'
>;

export const mapRecordToBodyFields = (record: AccidentReportRecord): AccidentReportBodyFields => {
  const mapped = mapRecordToForm(record, '');
  return {
    accidentSummary: mapped.accidentSummary,
    accidentDetails: mapped.accidentDetails,
    accidentCause: mapped.accidentCause,
    followUpActions: mapped.followUpActions,
    otherNotes: mapped.otherNotes,
  };
};

export const hasBodyFieldsContent = (form: AccidentReportForm): boolean =>
  Boolean(
    form.accidentSummary.trim() ||
      form.accidentDetails.trim() ||
      form.accidentCause.trim() ||
      form.followUpActions.trim() ||
      form.otherNotes.trim()
  );

export const mapRecordToForm = (
  record: AccidentReportRecord,
  confirmCode: string
): AccidentReportForm => ({
  reportDate: record.report_date?.trim() ?? '',
  departmentName: record.department_name?.trim() || DEFAULT_DEPARTMENT_NAME,
  authorName: record.author_name?.trim() ?? '',
  broadcastMedia: parseBroadcastMedia(record.broadcast_media),
  accidentDatetime: record.accident_datetime?.trim() ?? '',
  location: record.location?.trim() ?? '',
  programName: record.program_name?.trim() ?? '',
  workers: record.workers?.trim() ?? '',
  accidentSummary: record.accident_summary?.trim() ?? '',
  accidentDetails: record.accident_details?.trim() ?? '',
  accidentCause: record.accident_cause?.trim() ?? '',
  followUpActions: record.follow_up_actions?.trim() ?? '',
  otherNotes: record.other_notes?.trim() ?? '',
  confirmCode,
});

export const isAccidentReportFormValid = (form: AccidentReportForm): boolean =>
  isConfirmCodeValid(form);

export const isMissingAccidentReportsTableError = (error: {
  code?: string;
  message?: string;
}): boolean =>
  error.code === 'PGRST205' || (error.message?.includes('accident_reports') ?? false);

export const submitAccidentReport = async (form: AccidentReportForm): Promise<void> => {
  if (!isConfirmCodeValid(form)) {
    throw new Error('확인 코드를 확인해 주세요.');
  }

  const { error } = await supabase.from('accident_reports').insert(mapFormToPayload(form));

  if (error) {
    throw error;
  }
};

export const fetchAccidentReportHistory = async (
  limit = 20
): Promise<AccidentReportRecord[]> => {
  const { data, error } = await supabase
    .from('accident_reports')
    .select(
      'id, report_date, department_name, author_name, broadcast_media, accident_datetime, location, program_name, workers, accident_summary, accident_details, accident_cause, follow_up_actions, other_notes, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []) as AccidentReportRecord[];
};

export const fetchAllAccidentReports = async (): Promise<AccidentReportRecord[]> => {
  const { data, error } = await supabase
    .from('accident_reports')
    .select(
      'id, report_date, department_name, author_name, broadcast_media, accident_datetime, location, program_name, workers, accident_summary, accident_details, accident_cause, follow_up_actions, other_notes, created_at'
    )
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as AccidentReportRecord[];
};

export const formatAccidentReportListLabel = (record: AccidentReportRecord): string => {
  const date = record.report_date?.trim() || '날짜 미입력';
  const author = record.author_name?.trim() || '작성자 미입력';
  const program = record.program_name?.trim() || '프로그램 미입력';
  return `${date} · ${author} · ${program}`;
};

export const getAccidentReportYear = (record: AccidentReportRecord): number => {
  const reportDate = record.report_date?.trim();
  if (reportDate) {
    const match = reportDate.match(/^(\d{4})/);
    if (match) {
      return Number(match[1]);
    }
  }

  return new Date(record.created_at).getFullYear();
};

export const filterAccidentReports = (
  records: AccidentReportRecord[],
  query: string
): AccidentReportRecord[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return records;
  }

  return records.filter((record) => {
    const searchableText = [
      record.report_date,
      record.department_name,
      record.author_name,
      record.broadcast_media,
      record.accident_datetime,
      record.location,
      record.program_name,
      record.workers,
      record.accident_summary,
      record.accident_details,
      record.accident_cause,
      record.follow_up_actions,
      record.other_notes,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
};

export interface AccidentReportYearGroup {
  year: number;
  reports: AccidentReportRecord[];
}

export const groupAccidentReportsByYear = (
  records: AccidentReportRecord[]
): AccidentReportYearGroup[] => {
  const grouped = new Map<number, AccidentReportRecord[]>();

  records.forEach((record) => {
    const year = getAccidentReportYear(record);
    const bucket = grouped.get(year);
    if (bucket) {
      bucket.push(record);
    } else {
      grouped.set(year, [record]);
    }
  });

  return Array.from(grouped.entries())
    .sort(([leftYear], [rightYear]) => rightYear - leftYear)
    .map(([year, reports]) => ({ year, reports }));
};

export const deleteAccidentReport = async (id: string): Promise<void> => {
  const { error } = await supabase.from('accident_reports').delete().eq('id', id);

  if (error) {
    throw error;
  }
};
