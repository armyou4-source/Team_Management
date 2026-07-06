import { supabase } from './supabaseClient';

export const REPORT_CONFIRM_CODE = '0000';
export const DEFAULT_DEPARTMENT_NAME = '보도기술팀';

export const BROADCAST_MEDIA_OPTIONS = ['TV', '제1FM', '제2FM', 'DMB', 'Youtube'] as const;
export type BroadcastMediaOption = (typeof BROADCAST_MEDIA_OPTIONS)[number];

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

export const isAccidentReportFormValid = (form: AccidentReportForm): boolean => {
  const payload = mapFormToPayload(form);

  return (
    Boolean(payload.report_date) &&
    Boolean(payload.department_name) &&
    Boolean(payload.author_name) &&
    form.broadcastMedia.length > 0 &&
    Boolean(payload.accident_datetime) &&
    Boolean(payload.program_name) &&
    Boolean(payload.accident_summary) &&
    Boolean(payload.accident_details) &&
    Boolean(payload.accident_cause) &&
    form.confirmCode === REPORT_CONFIRM_CODE
  );
};

export const isMissingAccidentReportsTableError = (error: {
  code?: string;
  message?: string;
}): boolean =>
  error.code === 'PGRST205' || (error.message?.includes('accident_reports') ?? false);

export const submitAccidentReport = async (form: AccidentReportForm): Promise<void> => {
  if (!isAccidentReportFormValid(form)) {
    throw new Error('입력 항목과 확인 코드를 확인해 주세요.');
  }

  const { error } = await supabase.from('accident_reports').insert(mapFormToPayload(form));

  if (error) {
    throw error;
  }
};
