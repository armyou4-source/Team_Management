import type { TenureExpiryMonthBucket } from './contractTenureService';
import { buildTenureChartYearRows, buildTenureNowLineLeft } from './contractTenureService';

interface TenureExpiryChartProps {
  buckets: TenureExpiryMonthBucket[];
  selectedMonthKey: string | null;
  onSelectMonthKey: (monthKey: string | null) => void;
  referenceDate: Date;
}

export default function TenureExpiryChart({
  buckets,
  selectedMonthKey,
  onSelectMonthKey,
  referenceDate,
}: TenureExpiryChartProps) {
  const yearRows = buildTenureChartYearRows(buckets, referenceDate);
  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth() + 1;
  const currentDay = referenceDate.getDate();
  const nowLineLeft = buildTenureNowLineLeft(referenceDate);

  const handleSelect = (monthKey: string) => {
    onSelectMonthKey(selectedMonthKey === monthKey ? null : monthKey);
  };

  return (
    <div className="green-plan-chart tenure-expiry-chart">
      <div className="green-plan-chart-header">
        <h4 className="green-plan-chart-title">근무 만기 예정 (연도 · 월별)</h4>
        <p className="green-plan-chart-desc">
          현재 연도 기준 3개년 · 월별 막대를 클릭하면 해당 월 근무 만기 대상자를 확인할 수 있습니다.
        </p>
      </div>
      <div className="tenure-expiry-chart-rows">
        {yearRows.map(({ year, totalCount, months }) => (
          <div key={year} className="tenure-expiry-year-row">
            <div className="tenure-expiry-year-label-col">
              <span className="green-plan-chart-year-value">{year}</span>
              <span className="green-plan-chart-year-total">{totalCount}명</span>
            </div>
            <div
              className="green-plan-chart-quarters tenure-expiry-months"
            >
              {year === currentYear && (
                <div
                  className="green-plan-chart-now-line tenure-expiry-now-line"
                  style={{ left: nowLineLeft }}
                  title={`현재 ${currentYear}년 ${currentMonth}월 ${currentDay}일`}
                  aria-hidden="true"
                />
              )}
              {months.map((bucket, index) => {
                const month = index + 1;
                const monthKey = `${year}-${month}`;
                const isSelected = selectedMonthKey === monthKey;

                if (!bucket) {
                  return (
                    <div
                      key={monthKey}
                      className={`green-plan-chart-bar empty tenure-expiry-bar${isSelected ? ' selected' : ''}`}
                    >
                      <div className="green-plan-chart-bar-track">
                        <div className="green-plan-chart-bar-fill" style={{ height: '0%' }} />
                      </div>
                      <span className="green-plan-chart-bar-quarter">{month}월</span>
                      <span className="green-plan-chart-bar-count">0</span>
                    </div>
                  );
                }

                return (
                  <button
                    key={bucket.key}
                    type="button"
                    className={`green-plan-chart-bar tenure-expiry-bar${isSelected ? ' selected' : ''}`}
                    onClick={() => handleSelect(monthKey)}
                    title={`${bucket.label} · ${bucket.count}명`}
                  >
                    <div className="green-plan-chart-bar-track">
                      <div className="green-plan-chart-bar-fill tenure-expiry-bar-fill" />
                    </div>
                    <span className="green-plan-chart-bar-quarter">{month}월</span>
                    <span className="green-plan-chart-bar-count">{bucket.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
