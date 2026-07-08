import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccidentReportReferenceSheet } from './AccidentReportPage';
import './AccidentReportPage.css';
import {
  deleteAccidentReport,
  fetchAllAccidentReports,
  filterAccidentReports,
  formatAccidentReportListLabel,
  getAccidentReportYear,
  groupAccidentReportsByYear,
  isMissingAccidentReportsTableError,
  type AccidentReportRecord,
} from './accidentReportService';
import './AccidentReportManagement.css';

interface AccidentReportManagementPanelProps {
  onCountChange?: (count: number) => void;
}

type YearFilter = 'all' | number;

export default function AccidentReportManagementPanel({
  onCountChange,
}: AccidentReportManagementPanelProps) {
  const [reports, setReports] = useState<AccidentReportRecord[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState<YearFilter>('all');
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);

    try {
      const entries = await fetchAllAccidentReports();
      setReports(entries);
      onCountChange?.(entries.length);
      setSelectedReportId((prev) => {
        if (prev && entries.some((entry) => entry.id === prev)) {
          return prev;
        }
        return entries[0]?.id ?? null;
      });
    } catch (err: unknown) {
      if (isMissingAccidentReportsTableError(err as { code?: string; message?: string })) {
        setDataError(
          'accident_reports 테이블이 없습니다. Supabase SQL Editor에서 supabase/migrations/009_create_accident_reports.sql 과 010_expand_accident_reports.sql 을 실행해 주세요.'
        );
      } else {
        const message = err instanceof Error ? err.message : '사고 보고서 목록을 불러오지 못했습니다.';
        setDataError(message);
      }
      setReports([]);
      onCountChange?.(0);
      setSelectedReportId(null);
    } finally {
      setDataLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    reports.forEach((report) => years.add(getAccidentReportYear(report)));
    return Array.from(years).sort((left, right) => right - left);
  }, [reports]);

  const filteredReports = useMemo(() => {
    const searched = filterAccidentReports(reports, searchQuery);
    if (yearFilter === 'all') {
      return searched;
    }
    return searched.filter((report) => getAccidentReportYear(report) === yearFilter);
  }, [reports, searchQuery, yearFilter]);

  const groupedReports = useMemo(
    () => groupAccidentReportsByYear(filteredReports),
    [filteredReports]
  );

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? null,
    [reports, selectedReportId]
  );

  const handleDelete = async (report: AccidentReportRecord) => {
    const confirmed = window.confirm(
      `${formatAccidentReportListLabel(report)}\n보고서를 삭제할까요?\n삭제 후 복구할 수 없습니다.`
    );
    if (!confirmed) {
      return;
    }

    setDeletingId(report.id);
    try {
      await deleteAccidentReport(report.id);
      setReports((prev) => {
        const next = prev.filter((entry) => entry.id !== report.id);
        onCountChange?.(next.length);
        setSelectedReportId((current) => {
          if (current !== report.id) {
            return current;
          }
          const remainingFiltered = filterAccidentReports(
            yearFilter === 'all'
              ? next
              : next.filter((entry) => getAccidentReportYear(entry) === yearFilter),
            searchQuery
          );
          return remainingFiltered[0]?.id ?? null;
        });
        return next;
      });
    } catch (err: unknown) {
      if (isMissingAccidentReportsTableError(err as { code?: string; message?: string })) {
        alert('accident_reports 테이블이 없어 삭제할 수 없습니다.');
      } else {
        const message = err instanceof Error ? err.message : '사고 보고서 삭제에 실패했습니다.';
        alert(message);
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="accident-report-management-main">
      <section className="accident-report-management-panel no-print">
        <div className="accident-report-management-header">
          <div>
            <h2 className="accident-report-management-title">사고 보고서 목록</h2>
            <p className="accident-report-management-desc">
              제출된 방송사고 보고서를 연도별로 확인할 수 있습니다.
            </p>
          </div>
          <a
            className="accident-report-management-link"
            href="/report"
            target="_blank"
            rel="noreferrer"
          >
            보고서 작성 페이지 열기
          </a>
        </div>

        <div className="accident-report-management-toolbar">
          <input
            type="search"
            className="accident-report-management-search"
            placeholder="날짜, 작성자, 프로그램, 사고 내용 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="accident-report-management-year-tabs">
            <button
              type="button"
              className={`accident-report-management-year-tab${yearFilter === 'all' ? ' active' : ''}`}
              onClick={() => setYearFilter('all')}
            >
              전체
            </button>
            {availableYears.map((year) => (
              <button
                key={year}
                type="button"
                className={`accident-report-management-year-tab${yearFilter === year ? ' active' : ''}`}
                onClick={() => setYearFilter(year)}
              >
                {year}
              </button>
            ))}
          </div>
          <span className="accident-report-management-count">
            {dataLoading ? '불러오는 중...' : `${filteredReports.length}건`}
          </span>
        </div>

        {dataLoading && <p className="accident-report-management-empty">목록을 불러오는 중...</p>}
        {dataError && !dataLoading && (
          <p className="accident-report-management-empty error">{dataError}</p>
        )}
        {!dataLoading && !dataError && filteredReports.length === 0 && (
          <p className="accident-report-management-empty">
            {searchQuery.trim() || yearFilter !== 'all'
              ? '검색 조건에 맞는 사고 보고서가 없습니다.'
              : '등록된 사고 보고서가 없습니다.'}
          </p>
        )}

        {!dataLoading && !dataError && groupedReports.length > 0 && (
          <div className="accident-report-year-groups">
            {groupedReports.map((group) => (
              <section key={group.year} className="accident-report-year-group">
                <div className="accident-report-year-group-header">
                  <h3 className="accident-report-year-group-title">{group.year}년</h3>
                  <span className="accident-report-year-group-count">{group.reports.length}건</span>
                </div>
                <ul className="accident-report-year-group-list">
                  {group.reports.map((report) => {
                    const isSelected = selectedReportId === report.id;
                    const isDeleting = deletingId === report.id;
                    return (
                      <li key={report.id} className="accident-report-year-group-list-item">
                        <button
                          type="button"
                          className={`accident-report-year-group-item${isSelected ? ' selected' : ''}`}
                          onClick={() => setSelectedReportId(report.id)}
                          disabled={isDeleting}
                        >
                          <span className="accident-report-year-group-item-label">
                            {formatAccidentReportListLabel(report)}
                          </span>
                          <span className="accident-report-year-group-item-meta">
                            {report.accident_datetime?.trim() || '사고 일시 미입력'}
                            {report.location?.trim() ? ` · ${report.location.trim()}` : ''}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="accident-report-delete-btn"
                          onClick={() => void handleDelete(report)}
                          disabled={isDeleting}
                          aria-label={`${formatAccidentReportListLabel(report)} 삭제`}
                        >
                          {isDeleting ? '삭제 중' : '삭제'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

      <section className="accident-report-management-detail accident-report-management-print-root">
        <div className="accident-report-management-detail-header no-print">
          <div>
            <h3 className="accident-report-management-detail-title">보고서 상세</h3>
            {selectedReport && (
              <p className="accident-report-management-detail-meta">
                {formatAccidentReportListLabel(selectedReport)}
              </p>
            )}
          </div>
          {selectedReport && (
            <div className="accident-report-management-detail-actions">
              <button
                type="button"
                className="accident-report-btn secondary"
                onClick={() => window.print()}
              >
                인쇄
              </button>
              <button
                type="button"
                className="accident-report-delete-btn detail"
                onClick={() => void handleDelete(selectedReport)}
                disabled={deletingId === selectedReport.id}
              >
                {deletingId === selectedReport.id ? '삭제 중' : '보고서 삭제'}
              </button>
            </div>
          )}
        </div>

        {!selectedReport && !dataLoading && !dataError && (
          <p className="accident-report-management-empty">목록에서 보고서를 선택해 주세요.</p>
        )}

        {selectedReport && <AccidentReportReferenceSheet record={selectedReport} />}
      </section>
    </div>
  );
}
