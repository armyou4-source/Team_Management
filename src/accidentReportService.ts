import { supabase } from './supabaseClient';

export const REPORT_CONFIRM_CODE = '0000';
export const REPORT_DEPARTMENT_NAME = '보도기술팀';

export interface AccidentReportForm {
  accidentDatetime: string;
  programName: string;
  accidentContent: string;
  causeAndMeasures: string;
  authorName: string;
  confirmCode: string;
}

export interface AccidentReportPayload {
  accident_datetime: string;
  program_name: string;
  accident_content: string;
  cause_and_measures: string;
  author_name: string;
}

export const createEmptyAccidentReportForm = (): AccidentReportForm => ({
  accidentDatetime: '',
  programName: '',
  accidentContent: '',
  causeAndMeasures: '',
  authorName: '',
  confirmCode: '',
});

export const mapFormToPayload = (form: AccidentReportForm): AccidentReportPayload => ({
  accident_datetime: form.accidentDatetime.trim(),
  program_name: form.programName.trim(),
  accident_content: form.accidentContent.trim(),
  cause_and_measures: form.causeAndMeasures.trim(),
  author_name: form.authorName.trim(),
});

export const isAccidentReportFormValid = (form: AccidentReportForm): boolean => {
  const payload = mapFormToPayload(form);
  return (
    Boolean(payload.accident_datetime) &&
    Boolean(payload.program_name) &&
    Boolean(payload.accident_content) &&
    Boolean(payload.cause_and_measures) &&
    Boolean(payload.author_name) &&
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
