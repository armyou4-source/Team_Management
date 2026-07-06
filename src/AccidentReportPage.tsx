import { useMemo, useState } from 'react';
import {
  REPORT_CONFIRM_CODE,
  REPORT_DEPARTMENT_NAME,
  createEmptyAccidentReportForm,
  isAccidentReportFormValid,
  isMissingAccidentReportsTableError,
  submitAccidentReport,
  type AccidentReportForm,
} from './accidentReportService';
import './AccidentReportPage.css';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const formatReportDate = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const weekday = WEEKDAY_LABELS[value.getDay()];
  return `${year}.${month}.${day}(${weekday})`;
};

export default function AccidentReportPage() {
  const [form, setForm] = useState<AccidentReportForm>(createEmptyAccidentReportForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const reportDate = useMemo(() => formatReportDate(new Date()), []);
  const canSubmit = isAccidentReportFormValid(form);
  const confirmCodeHint =
    form.confirmCode.length > 0 && form.confirmCode !== REPORT_CONFIRM_CODE
      ? '확인 코드가 올바르지 않습니다.'
      : null;

  const updateField = <K extends keyof AccidentReportForm>(key: K, value: AccidentReportForm[K]) => {
    setSubmitSuccess(false);
    setSubmitError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setForm(createEmptyAccidentReportForm());
    setSubmitError(null);
    setSubmitSuccess(false);
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      await submitAccidentReport(form);
      setSubmitSuccess(true);
      window.setTimeout(() => {
        window.print();
      }, 300);
    } catch (err: unknown) {
      if (isMissingAccidentReportsTableError(err as { code?: string; message?: string })) {
        setSubmitError(
          'accident_reports 테이블이 없습니다. Supabase SQL Editor에서 supabase/migrations/009_create_accident_reports.sql 을 실행해 주세요.'
        );
      } else {
        const message = err instanceof Error ? err.message : '보고서 제출에 실패했습니다.';
        setSubmitError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="accident-report-page">
      <div className="accident-report-toolbar no-print">
        <div className="accident-report-toolbar-left">
          <h1 className="accident-report-toolbar-title">방송사고 보고서 작성</h1>
          <p className="accident-report-toolbar-desc">
            작성 후 제출하면 서버에 저장되며, 인쇄 화면이 열립니다.
          </p>
        </div>
        <div className="accident-report-toolbar-actions">
          <button type="button" className="accident-report-btn secondary" onClick={handleReset}>
            취소
          </button>
          <button type="button" className="accident-report-btn secondary" onClick={() => window.print()}>
            인쇄
          </button>
          <button
            type="button"
            className="accident-report-btn primary"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || submitting}
          >
            {submitting ? '제출 중...' : '제출하기'}
          </button>
        </div>
      </div>

      {submitError && <p className="accident-report-feedback error no-print">{submitError}</p>}
      {submitSuccess && (
        <p className="accident-report-feedback success no-print">
          보고서가 제출되었습니다. 인쇄 창을 확인해 주세요.
        </p>
      )}

      <div className="accident-report-sheet-wrap">
        <article className="accident-report-sheet" aria-label="방송사고 보고서">
          <header className="accident-report-header">
            <div className="accident-report-logo" aria-hidden="true">
              MBC
            </div>
            <h2 className="accident-report-title">방송사고 보고서</h2>
            <div className="accident-report-date">{reportDate}</div>
          </header>

          <table className="accident-report-table">
            <tbody>
              <tr>
                <th className="accident-report-label">보고자</th>
                <td className="accident-report-dept">{REPORT_DEPARTMENT_NAME}</td>
                <td className="accident-report-value">
                  <input
                    className="accident-report-input inline"
                    type="text"
                    value={form.authorName}
                    onChange={(e) => updateField('authorName', e.target.value)}
                    placeholder="작성자 이름"
                    aria-label="작성자 이름"
                  />
                </td>
              </tr>
              <tr>
                <th className="accident-report-label">사고 일시</th>
                <td className="accident-report-value span-2" colSpan={2}>
                  <input
                    className="accident-report-input"
                    type="text"
                    value={form.accidentDatetime}
                    onChange={(e) => updateField('accidentDatetime', e.target.value)}
                    placeholder="예) 2026. 6. 4(목) 20:48:07~20:48:15, 약 8초간"
                    aria-label="사고 일시"
                  />
                </td>
              </tr>
              <tr>
                <th className="accident-report-label">프로그램</th>
                <td className="accident-report-value span-2" colSpan={2}>
                  <input
                    className="accident-report-input"
                    type="text"
                    value={form.programName}
                    onChange={(e) => updateField('programName', e.target.value)}
                    placeholder="방송 프로그램명"
                    aria-label="방송 프로그램명"
                  />
                </td>
              </tr>
              <tr>
                <th className="accident-report-label">사고 내용</th>
                <td className="accident-report-value span-2" colSpan={2}>
                  <textarea
                    className="accident-report-textarea medium"
                    value={form.accidentContent}
                    onChange={(e) => updateField('accidentContent', e.target.value)}
                    placeholder="사고 내용을 입력하세요"
                    aria-label="사고 내용"
                  />
                </td>
              </tr>
              <tr>
                <th className="accident-report-label">원인 및 대책</th>
                <td className="accident-report-value span-2" colSpan={2}>
                  <textarea
                    className="accident-report-textarea large"
                    value={form.causeAndMeasures}
                    onChange={(e) => updateField('causeAndMeasures', e.target.value)}
                    placeholder="사고 원인, 후속 조치, 개선 방안 등을 입력하세요"
                    aria-label="원인 및 대책"
                  />
                </td>
              </tr>
            </tbody>
          </table>

          <div className="accident-report-page-no" aria-hidden="true">
            - 1 -
          </div>
        </article>
      </div>

      <section className="accident-report-auth no-print">
        <label className="accident-report-auth-label" htmlFor="accident-report-confirm-code">
          확인 코드
        </label>
        <input
          id="accident-report-confirm-code"
          className="accident-report-auth-input"
          type="password"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          autoComplete="off"
          value={form.confirmCode}
          onChange={(e) => updateField('confirmCode', e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="4자리 숫자"
          aria-describedby="accident-report-confirm-hint"
        />
        <p id="accident-report-confirm-hint" className="accident-report-auth-hint">
          팀 공용 확인 코드를 입력하면 제출할 수 있습니다.
          {confirmCodeHint ? ` ${confirmCodeHint}` : ''}
        </p>
      </section>
    </div>
  );
}
