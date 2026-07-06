import type { GreenPlanQuarterBucket } from './retirementService';
import { getQuarterFromDate, groupGreenPlanBucketsByYear } from './retirementService';

interface GreenPlanStartChartProps {
  buckets: GreenPlanQuarterBucket[];
  selectedYear: number | null;
  onSelectYear: (year: number | null) => void;
  referenceDate: Date;
}

export default function GreenPlanStartChart({
  buckets,
  selectedYear,
  onSelectYear,
  referenceDate,
}: GreenPlanStartChartProps) {
  const yearGroups = groupGreenPlanBucketsByYear(buckets);
  const currentYear = referenceDate.getFullYear();
  const currentQuarter = getQuarterFromDate(referenceDate);

  if (buckets.length === 0) {
    return (
      <div className="green-plan-chart-empty">그린플랜 시작 예정 인원이 없습니다.</div>
    );
  }

  const handleSelect = (year: number) => {
    onSelectYear(selectedYear === year ? null : year);
  };

  return (
    <div className="green-plan-chart">
      <div className="green-plan-chart-header">
        <h4 className="green-plan-chart-title">그린플랜 시작 예정 (연도 · 분기별)</h4>
        <p className="green-plan-chart-desc">
          분기 막대를 클릭하면 해당 연도 그린플랜 시작 대상자 전체를 확인할 수 있습니다.
        </p>
      </div>
      <div className="green-plan-chart-scroll">
        <div className="green-plan-chart-body">
          {yearGroups.map(({ year, totalCount, quarters }, yearIndex) => (
            <div key={year} className="green-plan-chart-year-block">
              {yearIndex > 0 && <div className="green-plan-chart-year-divider" aria-hidden="true" />}
              <div className="green-plan-chart-year-group">
                <div className="green-plan-chart-year-label">
                  <span className="green-plan-chart-year-value">{year}</span>
                  <span className="green-plan-chart-year-total">{totalCount}명</span>
                </div>
                <div
                  className="green-plan-chart-quarters"
                  style={
                    year === currentYear
                      ? ({ '--now-quarter': String(currentQuarter) } as React.CSSProperties)
                      : undefined
                  }
                >
                  {year === currentYear && (
                    <div
                      className="green-plan-chart-now-line"
                      title={`현재 ${currentYear}년 ${currentQuarter}분기`}
                      aria-hidden="true"
                    />
                  )}
                  {quarters.map((bucket, index) => {
                    const quarter = index + 1;
                    const isSelected = selectedYear === year;

                    if (!bucket) {
                      return (
                        <div
                          key={`${year}-Q${quarter}-empty`}
                          className={`green-plan-chart-bar empty green-plan-start-bar${isSelected ? ' selected' : ''}`}
                        >
                          <div className="green-plan-chart-bar-track">
                            <div className="green-plan-chart-bar-fill" style={{ height: '0%' }} />
                            <span className="green-plan-bar-count-in">0</span>
                          </div>
                          <span className="green-plan-chart-bar-quarter">Q{quarter}</span>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={bucket.key}
                        type="button"
                        className={`green-plan-chart-bar green-plan-start-bar${isSelected ? ' selected' : ''}`}
                        onClick={() => handleSelect(year)}
                        title={`${bucket.label} · ${bucket.count}명 · ${year}년 총 ${totalCount}명`}
                      >
                        <div className="green-plan-chart-bar-track">
                          <div className="green-plan-chart-bar-fill green-plan-start-bar-fill" />
                          <span className="green-plan-bar-count-in">{bucket.count}</span>
                        </div>
                        <span className="green-plan-chart-bar-quarter">Q{quarter}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
