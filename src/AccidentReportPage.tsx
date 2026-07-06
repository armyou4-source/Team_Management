import { useMemo, useState } from 'react';
import {
  BROADCAST_MEDIA_OPTIONS,
  REPORT_CONFIRM_CODE,
  createEmptyAccidentReportForm,
  isAccidentReportFormValid,
  isMissingAccidentReportsTableError,
  submitAccidentReport,
  type AccidentReportForm,
  type BroadcastMediaOption,
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

function GuidedTextarea({
  id,
  className,
  value,
  onChange,
  ariaLabel,
}: {
  id: string;
  className: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className={`accident-report-guided-area ${className}`}>
      <div className="accident-report-guides" aria-hidden="true">
        {className === 'guide-circumstance' || className === 'guide-cause' ? (
          <>
            <p>○</p>
            <p>-</p>
            <p>-</p>
            <p className="spacer" />
            <p>○</p>
            <p>-</p>
            <p>-</p>
            <p className="spacer" />
            <p>○</p>
            <p className="spacer" />
            <p>○</p>
          </>
        ) : className === 'guide-followup' ? (
          <>
            <p>○</p>
            <p>-</p>
            <p className="spacer" />
            <p>○</p>
            <p>-</p>
          </>
        ) : (
          <>
            <p>○</p>
            <p className="spacer" />
            <p>○</p>
          </>
        )}
      </div>
      <textarea
        id={id}
        className="accident-report-textarea guided"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
      />
    </div>
  );
}

export default function AccidentReportPage() {
  const [form, setForm] = useState<AccidentReportForm>(() => ({
    ...createEmptyAccidentReportForm(),
    reportDate: formatReportDate(new Date()),
  }));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const canSubmit = useMemo(() => isAccidentReportFormValid(form), [form]);
  const confirmCodeHint =
    form.confirmCode.length > 0 && form.confirmCode !== REPORT_CONFIRM_CODE
      ? '확인 코드가 올바르지 않습니다.'
      : null;

  const updateField = <K extends keyof AccidentReportForm>(key: K, value: AccidentReportForm[K]) => {
    setSubmitSuccess(false);
    setSubmitError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleBroadcastMedia = (media: BroadcastMediaOption) => {
    setSubmitSuccess(false);
    setSubmitError(null);
    setForm((prev) => {
      const exists = prev.broadcastMedia.includes(media);
      return {
        ...prev,
        broadcastMedia: exists
          ? prev.broadcastMedia.filter((item) => item !== media)
          : [...prev.broadcastMedia, media],
      };
    });
  };

  const handleReset = () => {
    setForm({
      ...createEmptyAccidentReportForm(),
      reportDate: formatReportDate(new Date()),
    });
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
          'accident_reports 테이블이 없습니다. Supabase SQL Editor에서 supabase/migrations/009_create_accident_reports.sql 과 010_expand_accident_reports.sql 을 실행해 주세요.'
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
          <table className="accident-report-table">
            <tbody>
              <tr className="accident-report-header-row">
                <td className="accident-report-logo" aria-hidden="true">
                  MBC
                </td>
                <td className="accident-report-title-cell">
                  <h2 className="accident-report-title">방송사고 보고서</h2>
                </td>
                <td className="accident-report-date-cell">
                  <input
                    className="accident-report-input inline date"
                    type="text"
                    value={form.reportDate}
                    onChange={(e) => updateField('reportDate', e.target.value)}
                    aria-label="보고서 작성 일자"
                  />
                </td>
              </tr>
              <tr>
                <th className="accident-report-label">보고자</th>
                <td className="accident-report-value center">
                  <input
                    className="accident-report-input inline"
                    type="text"
                    value={form.departmentName}
                    onChange={(e) => updateField('departmentName', e.target.value)}
                    placeholder="(부서명)"
                    aria-label="부서명"
                  />
                </td>
                <td className="accident-report-value center">
                  <input
                    className="accident-report-input inline"
                    type="text"
                    value={form.authorName}
                    onChange={(e) => updateField('authorName', e.target.value)}
                    placeholder="(이름)"
                    aria-label="보고자 이름"
                  />
                </td>
              </tr>
              <tr>
                <th className="accident-report-label">방송 매체</th>
                <td className="accident-report-value span-2" colSpan={2}>
                  <div className="accident-report-media-options" role="group" aria-label="방송 매체">
                    {BROADCAST_MEDIA_OPTIONS.map((media) => {
                      const checked = form.broadcastMedia.includes(media);
                      return (
                        <label key={media} className="accident-report-media-option">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleBroadcastMedia(media)}
                          />
                          <span className={`accident-report-media-box${checked ? ' checked' : ''}`} />
                          <span>{media}</span>
                        </label>
                      );
                    })}
                  </div>
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
                    aria-label="사고 일시"
                  />
                </td>
              </tr>
              <tr>
                <th className="accident-report-label">발생 장소</th>
                <td className="accident-report-value span-2" colSpan={2}>
                  <input
                    className="accident-report-input"
                    type="text"
                    value={form.location}
                    onChange={(e) => updateField('location', e.target.value)}
                    aria-label="발생 장소"
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
                    aria-label="프로그램"
                  />
                </td>
              </tr>
              <tr>
                <th className="accident-report-label">근무자</th>
                <td className="accident-report-value span-2" colSpan={2}>
                  <input
                    className="accident-report-input"
                    type="text"
                    value={form.workers}
                    onChange={(e) => updateField('workers', e.target.value)}
                    aria-label="근무자"
                  />
                </td>
              </tr>
              <tr>
                <th className="accident-report-label">사고 내용</th>
                <td className="accident-report-value span-2" colSpan={2}>
                  <input
                    className="accident-report-input"
                    type="text"
                    value={form.accidentSummary}
                    onChange={(e) => updateField('accidentSummary', e.target.value)}
                    aria-label="사고 내용"
                  />
                </td>
              </tr>
              <tr className="accident-report-tall-row">
                <th className="accident-report-label">사고 경위</th>
                <td className="accident-report-value span-2" colSpan={2}>
                  <GuidedTextarea
                    id="accident-details"
                    className="guide-circumstance"
                    value={form.accidentDetails}
                    onChange={(value) => updateField('accidentDetails', value)}
                    ariaLabel="사고 경위"
                  />
                </td>
              </tr>
              <tr className="accident-report-tall-row">
                <th className="accident-report-label">사고 원인</th>
                <td className="accident-report-value span-2" colSpan={2}>
                  <GuidedTextarea
                    id="accident-cause"
                    className="guide-cause"
                    value={form.accidentCause}
                    onChange={(value) => updateField('accidentCause', value)}
                    ariaLabel="사고 원인"
                  />
                </td>
              </tr>
              <tr className="accident-report-medium-row">
                <th className="accident-report-label">후속 조치</th>
                <td className="accident-report-value span-2" colSpan={2}>
                  <GuidedTextarea
                    id="follow-up-actions"
                    className="guide-followup"
                    value={form.followUpActions}
                    onChange={(value) => updateField('followUpActions', value)}
                    ariaLabel="후속 조치"
                  />
                </td>
              </tr>
              <tr className="accident-report-short-row">
                <th className="accident-report-label">기타</th>
                <td className="accident-report-value span-2" colSpan={2}>
                  <GuidedTextarea
                    id="other-notes"
                    className="guide-other"
                    value={form.otherNotes}
                    onChange={(value) => updateField('otherNotes', value)}
                    ariaLabel="기타"
                  />
                </td>
              </tr>
            </tbody>
          </table>
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
