import { useCallback, useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react';
import {
  ACCIDENT_LOCATION_OPTIONS,
  ACCIDENT_PROGRAM_OPTIONS,
  BROADCAST_MEDIA_OPTIONS,
  LOCATION_MANUAL_OPTION,
  PROGRAM_MANUAL_OPTION,
  REPORT_CONFIRM_CODE,
  canEditAccidentReport,
  createEmptyAccidentReportForm,
  fetchAccidentReportById,
  fetchAccidentReportHistory,
  formatAccidentReportListLabel,
  hasBodyFieldsContent,
  hasAccidentReportFormContent,
  isConfirmCodeValid,
  loadAccidentReportFormFromRecord,
  mapRecordToBodyFields,
  isMissingAccidentReportsTableError,
  isMissingAccidentReportRpcError,
  mapRecordToForm,
  parseReportDateToIso,
  submitAccidentReport,
  updateAccidentReport,
  type AccidentReportForm,
  type AccidentReportRecord,
  type BroadcastMediaOption,
} from './accidentReportService';
import { fetchCurrentMemberProfile } from './authService';
import {
  calculateAccidentDurationSeconds,
  formatAccidentDurationKorean,
  formatReportDate,
  parseAccidentDatetime,
  parseIsoDateString,
  serializeAccidentDatetimeParts,
  type AccidentDatetimeParts,
} from './accidentDatetime';
import {
  expandWorkerSegments,
  fetchAccidentWorkerProfiles,
  formatAccidentWorkerLine,
  formatWorkerSuggestionLabel,
  getCurrentWorkerSegment,
  replaceCurrentWorkerSegment,
  searchWorkerProfiles,
  type AccidentWorkerProfile,
} from './accidentWorkerService';
import './AccidentReportPage.css';

export { formatReportDate };

export const toIsoDateString = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatHistoryLabel = formatAccidentReportListLabel;

const ROW_RESIZE_UNIT = 34;
const MIN_FLEX_ROW_HEIGHT = ROW_RESIZE_UNIT;
const FLEX_ROW_CHROME = 16;
const FLEX_TABLE_LAYOUT_CHROME = 10;

const FLEX_ROW_KEYS = ['summary', 'details', 'cause', 'followUp', 'other'] as const;
type FlexRowKey = (typeof FLEX_ROW_KEYS)[number];
type FlexHeights = Record<FlexRowKey, number>;

const FLEX_ROW_WEIGHTS: FlexHeights = {
  summary: 2,
  details: 5,
  cause: 5,
  followUp: 2,
  other: 2,
};

const createFlexHeights = (total: number): FlexHeights => {
  const weightSum = FLEX_ROW_KEYS.reduce((sum, key) => sum + FLEX_ROW_WEIGHTS[key], 0);
  const heights = {} as FlexHeights;
  let assigned = 0;

  FLEX_ROW_KEYS.forEach((key, index) => {
    if (index === FLEX_ROW_KEYS.length - 1) {
      heights[key] = Math.max(MIN_FLEX_ROW_HEIGHT, total - assigned);
      return;
    }
    heights[key] = Math.max(
      MIN_FLEX_ROW_HEIGHT,
      Math.round((total * FLEX_ROW_WEIGHTS[key]) / weightSum)
    );
    assigned += heights[key];
  });

  return heights;
};

const getFlexRowsBudget = (sectionHeight: number): number =>
  Math.max(
    MIN_FLEX_ROW_HEIGHT * FLEX_ROW_KEYS.length,
    sectionHeight - FLEX_TABLE_LAYOUT_CHROME
  );

const scaleFlexHeights = (prev: FlexHeights, total: number): FlexHeights => {
  const sum = FLEX_ROW_KEYS.reduce((acc, key) => acc + prev[key], 0);
  if (sum <= 0) {
    return createFlexHeights(total);
  }

  const next = {} as FlexHeights;
  let assigned = 0;

  FLEX_ROW_KEYS.forEach((key, index) => {
    if (index === FLEX_ROW_KEYS.length - 1) {
      next[key] = Math.max(MIN_FLEX_ROW_HEIGHT, total - assigned);
      return;
    }
    next[key] = Math.max(MIN_FLEX_ROW_HEIGHT, Math.round((prev[key] / sum) * total));
    assigned += next[key];
  });

  return next;
};

const redistributeFlexHeights = (
  prev: FlexHeights,
  key: FlexRowKey,
  nextHeight: number,
  flexTotal: number,
  minHeight: number
): FlexHeights | null => {
  const index = FLEX_ROW_KEYS.indexOf(key);
  const belowKeys = FLEX_ROW_KEYS.slice(index + 1);
  const aboveKeys = FLEX_ROW_KEYS.slice(0, index);
  const aboveSum = aboveKeys.reduce((sum, rowKey) => sum + prev[rowKey], 0);

  const maxCurrent =
    belowKeys.length > 0
      ? flexTotal - aboveSum - belowKeys.length * minHeight
      : flexTotal - aboveSum - aboveKeys.length * minHeight;

  const clamped = Math.max(minHeight, Math.min(nextHeight, maxCurrent));
  const delta = clamped - prev[key];
  if (delta === 0) {
    return prev;
  }

  const next = { ...prev, [key]: clamped };

  if (belowKeys.length > 0) {
    const belowSum = belowKeys.reduce((sum, rowKey) => sum + prev[rowKey], 0);
    const newBelowSum = belowSum - delta;
    if (newBelowSum < belowKeys.length * minHeight) {
      return null;
    }

    let assigned = 0;
    belowKeys.forEach((rowKey, belowIndex) => {
      if (belowIndex === belowKeys.length - 1) {
        next[rowKey] = Math.max(minHeight, flexTotal - aboveSum - clamped - assigned);
        return;
      }
      const value = Math.max(minHeight, Math.round(prev[rowKey] - delta * (prev[rowKey] / belowSum)));
      next[rowKey] = value;
      assigned += value;
    });
  } else if (aboveKeys.length > 0) {
    const adjustableAboveSum = aboveKeys.reduce((sum, rowKey) => sum + prev[rowKey], 0);
    const newAboveSum = adjustableAboveSum - delta;
    if (newAboveSum < aboveKeys.length * minHeight) {
      return null;
    }

    let assigned = 0;
    aboveKeys.forEach((rowKey, aboveIndex) => {
      if (aboveIndex === aboveKeys.length - 1) {
        next[rowKey] = Math.max(minHeight, flexTotal - clamped - assigned);
        return;
      }
      const value = Math.max(
        minHeight,
        Math.round(prev[rowKey] - delta * (prev[rowKey] / adjustableAboveSum))
      );
      next[rowKey] = value;
      assigned += value;
    });
  }

  return next;
};

const getMaxFlexRowHeight = (
  prev: FlexHeights,
  key: FlexRowKey,
  flexTotal: number,
  minHeight: number
): number => {
  const index = FLEX_ROW_KEYS.indexOf(key);
  const belowKeys = FLEX_ROW_KEYS.slice(index + 1);
  const aboveKeys = FLEX_ROW_KEYS.slice(0, index);
  const aboveSum = aboveKeys.reduce((sum, rowKey) => sum + prev[rowKey], 0);

  if (belowKeys.length > 0) {
    return flexTotal - aboveSum - belowKeys.length * minHeight;
  }

  return flexTotal - aboveSum - aboveKeys.length * minHeight;
};

const normalizeFlexHeights = (heights: FlexHeights, total: number): FlexHeights => {
  const sum = FLEX_ROW_KEYS.reduce((acc, key) => acc + heights[key], 0);
  const diff = total - sum;
  if (diff === 0) {
    return heights;
  }

  return {
    ...heights,
    other: Math.max(MIN_FLEX_ROW_HEIGHT, heights.other + diff),
  };
};

function FlexResizableField({
  id,
  value,
  onChange,
  ariaLabel,
  rows = 2,
  rowHeight,
  minRowHeight,
  maxRowHeight,
  onRowHeightChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  rows?: number;
  rowHeight: number;
  minRowHeight: number;
  maxRowHeight: number;
  onRowHeightChange: (rowHeight: number) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const syncingRef = useRef(false);

  const textareaHeight = Math.max(rowHeight - FLEX_ROW_CHROME, minRowHeight - FLEX_ROW_CHROME);
  const minTextareaHeight = minRowHeight - FLEX_ROW_CHROME;
  const maxTextareaHeight = maxRowHeight - FLEX_ROW_CHROME;

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    syncingRef.current = true;
    el.style.height = `${textareaHeight}px`;
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  }, [textareaHeight]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      if (syncingRef.current) return;

      const measured = el.offsetHeight;
      const nextRowHeight = measured + FLEX_ROW_CHROME;
      if (Math.abs(nextRowHeight - rowHeight) > 1) {
        onRowHeightChange(nextRowHeight);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [rowHeight, onRowHeightChange]);

  return (
    <textarea
      ref={textareaRef}
      id={id}
      name={id}
      className="accident-report-textarea resizable flex-resizable"
      style={{
        minHeight: minTextareaHeight,
        maxHeight: maxTextareaHeight,
      }}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      data-lpignore="true"
      data-form-type="other"
    />
  );
}

function AccidentDatetimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [parts, setParts] = useState<AccidentDatetimeParts>(() => parseAccidentDatetime(value));
  const lastSerializedRef = useRef(value);

  useEffect(() => {
    if (value === lastSerializedRef.current) {
      return;
    }
    lastSerializedRef.current = value;
    setParts(parseAccidentDatetime(value));
  }, [value]);

  const commitParts = useCallback(
    (getNext: (prev: AccidentDatetimeParts) => AccidentDatetimeParts) => {
      setParts((prev) => {
        const next = getNext(prev);
        const serialized = serializeAccidentDatetimeParts(next);
        lastSerializedRef.current = serialized;
        onChange(serialized);
        return next;
      });
    },
    [onChange]
  );

  const handleDateChange = (dateIso: string) => {
    commitParts((prev) => ({ ...prev, dateIso }));
  };

  const handleTimeChange = (key: keyof AccidentDatetimeParts, segmentValue: string) => {
    commitParts((prev) => ({
      ...prev,
      [key]: segmentValue.replace(/\D/g, '').slice(0, 2),
    }));
  };

  const normalizeTimeSegment = (key: keyof AccidentDatetimeParts, max: number) => {
    commitParts((prev) => {
      const raw = prev[key];
      if (!raw.trim()) {
        return prev;
      }
      const parsed = Math.min(max, Math.max(0, Number(raw) || 0));
      return { ...prev, [key]: String(parsed).padStart(2, '0') };
    });
  };

  const dateLabel = parts.dateIso
    ? (() => {
        const parsed = parseIsoDateString(parts.dateIso);
        return parsed ? formatReportDate(parsed) : '';
      })()
    : '';

  const durationSeconds = calculateAccidentDurationSeconds(parts);
  const durationLabel =
    durationSeconds !== null ? formatAccidentDurationKorean(durationSeconds) : null;

  const renderTimeSegment = (
    key: keyof AccidentDatetimeParts,
    max: number,
    ariaLabel: string
  ) => (
    <input
      type="text"
      inputMode="numeric"
      maxLength={2}
      className="accident-datetime-time-segment"
      value={parts[key]}
      onChange={(e) => handleTimeChange(key, e.target.value)}
      onBlur={() => normalizeTimeSegment(key, max)}
      aria-label={ariaLabel}
      autoComplete="off"
    />
  );

  return (
    <div className="accident-datetime-field">
      <div className="accident-datetime-editor">
        <div className="accident-datetime-date-wrap">
          <span
            className={`accident-datetime-date-text${dateLabel ? '' : ' placeholder'}`}
            aria-hidden="true"
          >
            {dateLabel || '(날짜)'}
          </span>
          <input
            type="date"
            className="accident-report-date-picker"
            value={parts.dateIso}
            onChange={(e) => handleDateChange(e.target.value)}
            aria-label="사고 발생 날짜"
          />
        </div>

        <div className="accident-datetime-time-range" aria-label="사고 발생 및 해결 시간">
          {renderTimeSegment('startHour', 23, '시작 시')}
          <span className="accident-datetime-separator">:</span>
          {renderTimeSegment('startMinute', 59, '시작 분')}
          <span className="accident-datetime-separator">:</span>
          {renderTimeSegment('startSecond', 59, '시작 초')}
          <span className="accident-datetime-range-divider">~</span>
          {renderTimeSegment('endHour', 23, '종료 시')}
          <span className="accident-datetime-separator">:</span>
          {renderTimeSegment('endMinute', 59, '종료 분')}
          <span className="accident-datetime-separator">:</span>
          {renderTimeSegment('endSecond', 59, '종료 초')}
        </div>

        {durationLabel && (
          <span className="accident-datetime-duration">{durationLabel}</span>
        )}
      </div>

      {value.trim() && (
        <p className="accident-datetime-print-value">{value.trim()}</p>
      )}
    </div>
  );
}

function SelectOrCustomField({
  id,
  value,
  onChange,
  options,
  manualOption,
  ariaLabel,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  manualOption: string;
  ariaLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const presetOptions = options.filter((option) => option !== manualOption);
  const trimmedValue = value.trim();
  const isPreset = presetOptions.includes(trimmedValue);
  const [manualMode, setManualMode] = useState(() => trimmedValue !== '' && !presetOptions.includes(trimmedValue));
  const isManual = manualMode;
  const displayText = isPreset ? trimmedValue : '';

  useEffect(() => {
    if (trimmedValue === '') return;
    if (presetOptions.includes(trimmedValue)) {
      setManualMode(false);
      return;
    }
    setManualMode(true);
  }, [trimmedValue, presetOptions]);

  useEffect(() => {
    if (!menuOpen) return;

    const updateMenuPosition = () => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      setMenuStyle({
        position: 'fixed',
        top: rect.bottom + 2,
        left: rect.left,
        width: rect.width,
        zIndex: 1000,
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [menuOpen]);

  const handleOptionSelect = (option: string) => {
    if (option === manualOption) {
      setManualMode(true);
      onChange('');
      setMenuOpen(false);
      return;
    }
    setManualMode(false);
    onChange(option);
    setMenuOpen(false);
  };

  return (
    <div className="accident-report-select-custom" ref={containerRef}>
      <div className="accident-report-select-custom-inner">
        {isManual ? (
          <input
            id={id}
            type="text"
            className="accident-report-select-display-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`${ariaLabel} 직접 입력`}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            data-lpignore="true"
            data-form-type="other"
          />
        ) : (
          <span
            id={id}
            className={`accident-report-select-display-text${displayText ? '' : ' placeholder'}`}
          >
            {displayText || '선택'}
          </span>
        )}
        <button
          type="button"
          className="accident-report-select-trigger"
          aria-label={`${ariaLabel} 선택`}
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="accident-report-select-trigger-label">선택</span>
          <span className="accident-report-select-trigger-icon" aria-hidden="true">
            ▼
          </span>
        </button>
        {menuOpen && (
          <ul
            className="accident-report-select-menu"
            role="listbox"
            aria-label={`${ariaLabel} 목록`}
            style={menuStyle}
          >
            {options.map((option) => (
              <li key={option}>
                <button
                  type="button"
                  role="option"
                  className={`accident-report-select-menu-item${
                    option === trimmedValue || (option === manualOption && isManual)
                      ? ' selected'
                      : ''
                  }`}
                  aria-selected={option === trimmedValue || (option === manualOption && isManual)}
                  onClick={() => handleOptionSelect(option)}
                >
                  {option}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {trimmedValue && (
        <span className="accident-report-field-print-value">{trimmedValue}</span>
      )}
    </div>
  );
}

function WorkersField({
  id,
  value,
  onChange,
  ariaLabel,
  compact = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  compact?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [profiles, setProfiles] = useState<AccidentWorkerProfile[]>([]);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AccidentWorkerProfile[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    let cancelled = false;

    fetchAccidentWorkerProfiles()
      .then((entries) => {
        if (!cancelled) {
          setProfiles(entries);
          setProfilesError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setProfiles([]);
          const message =
            err instanceof Error
              ? err.message
              : '근무자 목록을 불러오지 못했습니다.';
          setProfilesError(message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const updateSuggestions = useCallback(
    (nextValue: string, cursor: number) => {
      const segment = getCurrentWorkerSegment(nextValue, cursor);
      const matches = searchWorkerProfiles(profiles, segment.text);
      setSuggestions(matches);
      setMenuOpen(matches.length > 0 && segment.text.length > 0);
    },
    [profiles]
  );

  const applyProfile = useCallback(
    (profile: AccidentWorkerProfile, cursor?: number) => {
      const currentCursor = cursor ?? textareaRef.current?.selectionStart ?? value.length;
      const formatted = formatAccidentWorkerLine(profile);
      const { text, selectionStart } = replaceCurrentWorkerSegment(
        value,
        currentCursor,
        formatted
      );
      onChange(text);
      setMenuOpen(false);
      setSuggestions([]);

      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(selectionStart, selectionStart);
      });
    },
    [onChange, value]
  );

  useEffect(() => {
    if (!menuOpen) return;

    const updateMenuPosition = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const rect = textarea.getBoundingClientRect();
      setMenuStyle({
        position: 'fixed',
        top: rect.bottom + 2,
        left: rect.left,
        width: Math.max(rect.width, 320),
        zIndex: 1000,
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [menuOpen]);

  const handleBlur = () => {
    window.setTimeout(() => {
      setMenuOpen(false);
      const expanded = expandWorkerSegments(value, profiles);
      if (expanded !== value) {
        onChange(expanded);
      }
    }, 120);
  };

  return (
    <div className="accident-report-workers-field" ref={containerRef}>
      <textarea
        ref={textareaRef}
        id={id}
        name={id}
        className={`accident-report-textarea${compact ? ' compact' : ''}`}
        rows={compact ? 1 : 2}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue);
          updateSuggestions(nextValue, event.target.selectionStart ?? nextValue.length);
        }}
        onKeyDown={(event) => {
          if (!menuOpen || suggestions.length === 0) return;

          if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            applyProfile(suggestions[0], textareaRef.current?.selectionStart ?? value.length);
          }

          if (event.key === 'Escape') {
            setMenuOpen(false);
          }
        }}
        onBlur={handleBlur}
        aria-label={ariaLabel}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        data-lpignore="true"
        data-form-type="other"
      />
      {profilesError && (
        <p className="accident-report-workers-error" role="status">
          {profilesError}
        </p>
      )}
      {menuOpen && suggestions.length > 0 && (
        <ul
          className="accident-report-workers-menu"
          role="listbox"
          aria-label={`${ariaLabel} 자동완성`}
          style={menuStyle}
        >
          {suggestions.map((profile) => (
            <li key={profile.memberId}>
              <button
                type="button"
                role="option"
                className="accident-report-workers-menu-item"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  applyProfile(profile, textareaRef.current?.selectionStart ?? value.length)
                }
              >
                <span className="accident-report-workers-menu-primary">
                  {formatAccidentWorkerLine(profile)}
                </span>
                <span className="accident-report-workers-menu-secondary">
                  {formatWorkerSuggestionLabel(profile)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReadonlyValue({ value, placeholder }: { value: string; placeholder?: string }) {
  const text = value.trim();
  if (!text && placeholder) {
    return <span className="accident-report-readonly-value placeholder">{placeholder}</span>;
  }
  return <div className="accident-report-readonly-value">{text || '\u00a0'}</div>;
}

export function AccidentReportReferenceSheet({ record }: { record: AccidentReportRecord }) {
  const data = useMemo(() => mapRecordToForm(record, ''), [record]);

  return (
    <div className="accident-report-sheet-wrap accident-report-reference-wrap">
      <article className="accident-report-sheet accident-report-reference-sheet" aria-label="지난 사고 보고서 참고">
        <div className="accident-report-tables">
          <table className="accident-report-table accident-report-table-header">
            <tbody>
              <tr className="accident-report-header-row">
                <td className="accident-report-logo">
                  <img className="accident-report-logo-image" src="/mbc-logo.png" alt="MBC" />
                </td>
                <td className="accident-report-title-cell">
                  <h2 className="accident-report-title">방송사고 보고서</h2>
                </td>
                <td className="accident-report-date-cell">
                  <span className="accident-report-date-text">
                    {data.reportDate || '(날짜)'}
                  </span>
                </td>
              </tr>
              <tr className="accident-report-reporter-row">
                <th className="accident-report-label">보고자</th>
                <td className="accident-report-value center">
                  <ReadonlyValue value={data.departmentName} />
                </td>
                <td className="accident-report-value center">
                  <ReadonlyValue value={data.authorName} placeholder="(이름)" />
                </td>
              </tr>
            </tbody>
          </table>

          <div className="accident-report-table-body-wrap accident-report-reference-body-wrap">
            <table className="accident-report-table accident-report-table-body">
              <tbody>
                <tr className="accident-report-compact-row">
                  <th className="accident-report-label">방송 매체</th>
                  <td className="accident-report-value span-2" colSpan={2}>
                    <div className="accident-report-media-options" aria-label="방송 매체">
                      {BROADCAST_MEDIA_OPTIONS.map((media) => {
                        const checked = data.broadcastMedia.includes(media);
                        return (
                          <span key={media} className="accident-report-media-option">
                            <span className={`accident-report-media-box${checked ? ' checked' : ''}`} />
                            <span className="accident-report-media-label">{media}</span>
                          </span>
                        );
                      })}
                    </div>
                  </td>
                </tr>
                <tr className="accident-report-ref-tall-compact-row">
                  <th className="accident-report-label">사고 일시</th>
                  <td className="accident-report-value span-2" colSpan={2}>
                    <ReadonlyValue value={data.accidentDatetime} />
                  </td>
                </tr>
                <tr className="accident-report-ref-tall-compact-row">
                  <th className="accident-report-label">발생 장소</th>
                  <td className="accident-report-value span-2" colSpan={2}>
                    <ReadonlyValue value={data.location} />
                  </td>
                </tr>
                <tr className="accident-report-ref-tall-compact-row">
                  <th className="accident-report-label">프로그램</th>
                  <td className="accident-report-value span-2" colSpan={2}>
                    <ReadonlyValue value={data.programName} />
                  </td>
                </tr>
                <tr className="accident-report-ref-tall-compact-row">
                  <th className="accident-report-label">근무자</th>
                  <td className="accident-report-value span-2" colSpan={2}>
                    <ReadonlyValue value={data.workers} />
                  </td>
                </tr>
                <tr className="accident-report-ref-large-row">
                  <th className="accident-report-label">사고 내용</th>
                  <td className="accident-report-value span-2" colSpan={2}>
                    <ReadonlyValue value={data.accidentSummary} />
                  </td>
                </tr>
                <tr className="accident-report-ref-large-row">
                  <th className="accident-report-label">사고 경위</th>
                  <td className="accident-report-value span-2" colSpan={2}>
                    <ReadonlyValue value={data.accidentDetails} />
                  </td>
                </tr>
                <tr className="accident-report-ref-large-row">
                  <th className="accident-report-label">사고 원인</th>
                  <td className="accident-report-value span-2" colSpan={2}>
                    <ReadonlyValue value={data.accidentCause} />
                  </td>
                </tr>
                <tr className="accident-report-ref-triple-row">
                  <th className="accident-report-label">후속 조치</th>
                  <td className="accident-report-value span-2" colSpan={2}>
                    <ReadonlyValue value={data.followUpActions} />
                  </td>
                </tr>
                <tr className="accident-report-ref-triple-row">
                  <th className="accident-report-label accident-report-other-label">
                    <span className="accident-report-other-label-main">기타</span>
                    <span className="accident-report-improvement-hint">(개선방안)</span>
                  </th>
                  <td className="accident-report-value span-2" colSpan={2}>
                    <ReadonlyValue value={data.otherNotes} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </article>
    </div>
  );
}

export default function AccidentReportPage() {
  const [reportDateIso, setReportDateIso] = useState('');
  const [form, setForm] = useState<AccidentReportForm>(() => createEmptyAccidentReportForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitAction, setSubmitAction] = useState<'submit' | 'update' | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<AccidentReportRecord[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<AccidentReportRecord | null>(null);
  const [pasteSuccess, setPasteSuccess] = useState(false);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [sessionSubmittedReportIds, setSessionSubmittedReportIds] = useState<Set<string>>(
    () => new Set()
  );
  const [isTeamLeaderEditor, setIsTeamLeaderEditor] = useState(false);
  const flexSectionRef = useRef<HTMLDivElement>(null);
  const [flexHeights, setFlexHeights] = useState<FlexHeights>(() =>
    createFlexHeights(MIN_FLEX_ROW_HEIGHT * FLEX_ROW_KEYS.length)
  );

  useLayoutEffect(() => {
    const section = flexSectionRef.current;
    if (!section) return;

    const syncFlexHeights = () => {
      const total = getFlexRowsBudget(section.clientHeight);
      if (total <= 0) return;
      setFlexHeights((prev) => normalizeFlexHeights(scaleFlexHeights(prev, total), total));
    };

    syncFlexHeights();
    const observer = new ResizeObserver(syncFlexHeights);
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void (async () => {
      const profile = await fetchCurrentMemberProfile();
      setIsTeamLeaderEditor(profile?.직위?.trim() === '팀장');
    })();
  }, []);

  const loadReportForEdit = useCallback(
    (record: AccidentReportRecord, options?: { skipConfirm?: boolean }) => {
      if (
        !isTeamLeaderEditor &&
        !canEditAccidentReport(record, form.authorName, sessionSubmittedReportIds) &&
        !options?.skipConfirm
      ) {
        setSubmitError('보고자 이름이 일치하는 보고서만 수정할 수 있습니다.');
        return false;
      }

      const nextForm = loadAccidentReportFormFromRecord(record, form.confirmCode);
      setForm(nextForm);
      setReportDateIso(parseReportDateToIso(nextForm.reportDate));
      setEditingReportId(record.id);
      setSubmitSuccess(false);
      setPasteSuccess(false);
      setSubmitError(null);
      return true;
    },
    [form.authorName, form.confirmCode, isTeamLeaderEditor, sessionSubmittedReportIds]
  );

  useEffect(() => {
    const editId = new URLSearchParams(window.location.search).get('edit');
    if (!editId) return;

    let cancelled = false;

    void (async () => {
      try {
        const record = await fetchAccidentReportById(editId);
        if (cancelled) return;

        if (!record) {
          setSubmitError('수정할 보고서를 찾을 수 없습니다.');
          return;
        }

        const nextForm = loadAccidentReportFormFromRecord(record, '');
        setForm(nextForm);
        setReportDateIso(parseReportDateToIso(nextForm.reportDate));
        setEditingReportId(record.id);
      } catch (err: unknown) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : '수정할 보고서를 불러오지 못했습니다.';
        setSubmitError(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleFlexRowResize = useCallback((key: FlexRowKey, nextHeight: number) => {
    const flexTotal = flexSectionRef.current
      ? getFlexRowsBudget(flexSectionRef.current.clientHeight)
      : FLEX_ROW_KEYS.reduce((sum, rowKey) => sum + flexHeights[rowKey], 0);
    const next = redistributeFlexHeights(
      flexHeights,
      key,
      nextHeight,
      flexTotal,
      MIN_FLEX_ROW_HEIGHT
    );
    if (next) {
      setFlexHeights(normalizeFlexHeights(next, flexTotal));
    }
  }, [flexHeights]);

  const flexTotalHeight = flexSectionRef.current
    ? getFlexRowsBudget(flexSectionRef.current.clientHeight)
    : FLEX_ROW_KEYS.reduce((sum, rowKey) => sum + flexHeights[rowKey], 0);

  const canSubmit = useMemo(() => isConfirmCodeValid(form), [form]);
  const confirmCodeHint =
    form.confirmCode.length > 0 && form.confirmCode !== REPORT_CONFIRM_CODE
      ? '확인 코드가 올바르지 않습니다.'
      : null;

  const updateField = <K extends keyof AccidentReportForm>(key: K, value: AccidentReportForm[K]) => {
    setSubmitSuccess(false);
    setPasteSuccess(false);
    setSubmitError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleReportDateChange = (isoValue: string) => {
    setReportDateIso(isoValue);
    const parsed = parseIsoDateString(isoValue);
    if (!parsed) return;
    updateField('reportDate', formatReportDate(parsed));
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
    setReportDateIso('');
    setEditingReportId(null);
    setForm((prev) => ({
      ...createEmptyAccidentReportForm(),
      confirmCode: prev.confirmCode,
    }));
    setSubmitError(null);
    setSubmitSuccess(false);
    setPasteSuccess(false);
    setHistoryOpen(false);
    setHistoryEntries([]);
    setHistoryError(null);
    setSelectedHistoryRecord(null);
  };

  const closeHistoryModal = () => {
    setHistoryOpen(false);
    setHistoryEntries([]);
    setHistoryError(null);
    setSelectedHistoryRecord(null);
  };

  const handleSelectHistoryEntry = (record: AccidentReportRecord) => {
    setSelectedHistoryRecord(record);
    setPasteSuccess(false);
  };

  const handlePasteBodyFromHistory = () => {
    if (!selectedHistoryRecord) return;

    if (hasBodyFieldsContent(form)) {
      const confirmed = window.confirm(
        '현재 사고 내용~기타 항목을 지난 사고 내용으로 바꿀까요?'
      );
      if (!confirmed) return;
    }

    const bodyFields = mapRecordToBodyFields(selectedHistoryRecord);
    setForm((prev) => ({
      ...prev,
      ...bodyFields,
    }));
    setSubmitSuccess(false);
    setSubmitError(null);
    setPasteSuccess(true);
    closeHistoryModal();
  };

  const handleEditFromHistory = () => {
    if (!selectedHistoryRecord) return;

    if ((hasAccidentReportFormContent(form) || editingReportId) &&
      !window.confirm('현재 작성 중인 내용을 선택한 보고서로 바꿔 수정할까요?')) {
      return;
    }

    if (!loadReportForEdit(selectedHistoryRecord, { skipConfirm: true })) {
      return;
    }

    closeHistoryModal();
  };

  const handleOpenHistory = async () => {
    if (!isConfirmCodeValid(form)) {
      setSubmitError('확인 코드를 먼저 입력해 주세요.');
      return;
    }

    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError(null);
    setSelectedHistoryRecord(null);
    setSubmitError(null);

    try {
      const entries = await fetchAccidentReportHistory();
      setHistoryEntries(entries);
    } catch (err: unknown) {
      if (isMissingAccidentReportsTableError(err as { code?: string; message?: string })) {
        setHistoryError(
          'accident_reports 테이블이 없습니다. Supabase SQL Editor에서 supabase/migrations/009_create_accident_reports.sql 과 010_expand_accident_reports.sql 을 실행해 주세요.'
        );
      } else if (isMissingAccidentReportRpcError(err as { code?: string; message?: string })) {
        setHistoryError(
          '지난 사고 목록을 불러올 수 없습니다. Supabase SQL Editor에서 supabase/migrations/015_accident_report_public_reads.sql 을 실행해 주세요.'
        );
      } else {
        const message =
          err instanceof Error ? err.message : '지난 사고 보고서를 불러오지 못했습니다.';
        setHistoryError(message);
      }
      setHistoryEntries([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      if (editingReportId) {
        await updateAccidentReport(editingReportId, form, { asLeader: isTeamLeaderEditor });
        setSubmitAction('update');
        setSubmitSuccess(true);
        setSessionSubmittedReportIds((prev) => {
          const next = new Set(prev);
          next.add(editingReportId);
          return next;
        });
        setEditingReportId(null);
        window.history.replaceState({}, '', window.location.pathname);
      } else {
        const submittedReportId = await submitAccidentReport(form);
        setSessionSubmittedReportIds((prev) => {
          const next = new Set(prev);
          next.add(submittedReportId);
          return next;
        });
        setSubmitAction('submit');
        setSubmitSuccess(true);
      }
    } catch (err: unknown) {
      if (isMissingAccidentReportsTableError(err as { code?: string; message?: string })) {
        setSubmitError(
          'accident_reports 테이블이 없습니다. Supabase SQL Editor에서 supabase/migrations/009_create_accident_reports.sql 과 010_expand_accident_reports.sql 을 실행해 주세요.'
        );
      } else if (isMissingAccidentReportRpcError(err as { code?: string; message?: string })) {
        setSubmitError(
          '보고서 수정 기능이 준비되지 않았습니다. Supabase SQL Editor에서 supabase/migrations/016_accident_reports_update.sql 을 실행해 주세요.'
        );
      } else {
        const message =
          err instanceof Error
            ? err.message
            : editingReportId
              ? '보고서 수정에 실패했습니다.'
              : '보고서 제출에 실패했습니다.';
        setSubmitError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="accident-report-page">
      <section className="accident-report-auth-top no-print">
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
          <strong>부 서무 전화번호 뒤 4자리를 입력 후 보고서 작성 기능 사용</strong>
          {confirmCodeHint ? ` ${confirmCodeHint}` : ''}
        </p>
      </section>

      <div className="accident-report-toolbar no-print">
        <div className="accident-report-toolbar-left">
          <h1 className="accident-report-toolbar-title">
            {editingReportId ? '방송사고 보고서 수정' : '방송사고 보고서 작성'}
          </h1>
          <p className="accident-report-toolbar-desc">
            {editingReportId
              ? '내용을 수정한 뒤 수정 완료를 누르면 저장됩니다.'
              : '작성 후 제출하면 서버에 저장됩니다. 인쇄는 인쇄 버튼을 사용해 주세요.'}
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
            className="accident-report-btn secondary"
            onClick={() => void handleOpenHistory()}
            disabled={!canSubmit || historyLoading}
          >
            {historyLoading ? '불러오는 중...' : '지난 사고 불러오기'}
          </button>
          <button
            type="button"
            className="accident-report-btn primary"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || submitting}
          >
            {submitting
              ? editingReportId
                ? '수정 중...'
                : '제출 중...'
              : editingReportId
                ? '수정 완료'
                : '제출하기'}
          </button>
        </div>
      </div>

      {historyOpen && (
        <div
          className="accident-report-modal-overlay no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="accident-report-history-modal-title"
        >
          <div className="accident-report-modal">
            <div className="accident-report-modal-header">
              <div>
                <h2 id="accident-report-history-modal-title" className="accident-report-modal-title">
                  {selectedHistoryRecord ? '지난 사고 보고서 참고' : '지난 사고 보고서 선택'}
                </h2>
                <p className="accident-report-modal-desc">
                  {selectedHistoryRecord
                    ? '참고용으로 표시됩니다. 수정하기로 전체 보고서를 불러오거나, 하단 내용만 붙여넣을 수 있습니다.'
                    : '참고용으로만 표시됩니다. 현재 작성 중인 보고서는 자동으로 변경되지 않습니다.'}
                </p>
              </div>
              <div className="accident-report-modal-header-actions">
                {selectedHistoryRecord && (
                  <button
                    type="button"
                    className="accident-report-btn secondary"
                    onClick={handleEditFromHistory}
                  >
                    수정하기
                  </button>
                )}
                {selectedHistoryRecord && (
                  <button
                    type="button"
                    className="accident-report-btn primary"
                    onClick={handlePasteBodyFromHistory}
                  >
                    하단 내용 보고서에 붙혀넣기
                  </button>
                )}
                {selectedHistoryRecord && (
                  <button
                    type="button"
                    className="accident-report-btn secondary"
                    onClick={() => setSelectedHistoryRecord(null)}
                  >
                    목록으로
                  </button>
                )}
                <button type="button" className="accident-report-btn secondary" onClick={closeHistoryModal}>
                  닫기
                </button>
              </div>
            </div>

            <div className="accident-report-modal-body">
              {historyLoading && <p className="accident-report-history-empty">불러오는 중...</p>}
              {historyError && <p className="accident-report-history-error">{historyError}</p>}

              {!historyLoading && !historyError && !selectedHistoryRecord && historyEntries.length === 0 && (
                <p className="accident-report-history-empty">불러올 지난 사고 보고서가 없습니다.</p>
              )}

              {!historyLoading && !historyError && !selectedHistoryRecord && historyEntries.length > 0 && (
                <ul className="accident-report-history-list">
                  {historyEntries.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        className="accident-report-history-item"
                        onClick={() => handleSelectHistoryEntry(entry)}
                      >
                        {formatHistoryLabel(entry)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {selectedHistoryRecord && <AccidentReportReferenceSheet record={selectedHistoryRecord} />}
            </div>

            {selectedHistoryRecord && (
              <div className="accident-report-modal-footer no-print">
                <button
                  type="button"
                  className="accident-report-btn secondary"
                  onClick={handleEditFromHistory}
                >
                  수정하기
                </button>
                <button
                  type="button"
                  className="accident-report-btn primary"
                  onClick={handlePasteBodyFromHistory}
                >
                  하단 내용 보고서에 붙혀넣기
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {pasteSuccess && (
        <p className="accident-report-feedback success no-print">
          지난 사고 보고서 하단 표 내용을 붙여넣었습니다.
        </p>
      )}

      {submitError && <p className="accident-report-feedback error no-print">{submitError}</p>}
      {submitSuccess && (
        <p className="accident-report-feedback success no-print">
          {submitAction === 'update' ? '보고서가 수정되었습니다.' : '보고서가 제출되었습니다.'}
        </p>
      )}

      <div className="accident-report-sheet-wrap">
        <article className="accident-report-sheet" aria-label="방송사고 보고서">
          <div className="accident-report-tables">
            <table className="accident-report-table accident-report-table-header">
              <tbody>
                <tr className="accident-report-header-row">
                  <td className="accident-report-logo">
                    <img className="accident-report-logo-image" src="/mbc-logo.png" alt="MBC" />
                  </td>
                  <td className="accident-report-title-cell">
                    <h2 className="accident-report-title">방송사고 보고서</h2>
                  </td>
                  <td className="accident-report-date-cell">
                    <div className="accident-report-date-wrap">
                      {form.reportDate ? (
                        <span className="accident-report-date-text">{form.reportDate}</span>
                      ) : (
                        <span className="accident-report-date-text placeholder" aria-hidden="true">
                          (날짜)
                        </span>
                      )}
                      <input
                        type="date"
                        className="accident-report-date-picker"
                        value={reportDateIso}
                        onChange={(e) => handleReportDateChange(e.target.value)}
                        aria-label="보고서 작성 일자"
                      />
                    </div>
                  </td>
                </tr>
                <tr className="accident-report-reporter-row">
                  <th className="accident-report-label">보고자</th>
                  <td className="accident-report-value center">
                    <input
                      className="accident-report-input inline reporter"
                      type="text"
                      name="report-department-field"
                      id="report-department-field"
                      value={form.departmentName}
                      onChange={(e) => updateField('departmentName', e.target.value)}
                      aria-label="부서명"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      data-lpignore="true"
                      data-form-type="other"
                    />
                  </td>
                  <td className="accident-report-value center">
                    <div className="accident-report-inline-field">
                      <input
                        className="accident-report-input inline reporter"
                        type="text"
                        name="report-person-name-field"
                        id="report-person-name-field"
                        value={form.authorName}
                        onChange={(e) => updateField('authorName', e.target.value)}
                        aria-label="보고자 이름"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        data-lpignore="true"
                        data-form-type="other"
                        readOnly
                        onFocus={(e) => e.currentTarget.removeAttribute('readOnly')}
                      />
                      {!form.authorName.trim() && (
                        <span className="accident-report-inline-placeholder" aria-hidden="true">
                          (이름)
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="accident-report-table-body-wrap">
              <table className="accident-report-table accident-report-table-body accident-report-table-body-fixed">
                <tbody>
                  <tr className="accident-report-standard-row">
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
                              <span className="accident-report-media-label">{media}</span>
                            </label>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                  <tr className="accident-report-standard-row accident-report-datetime-row">
                    <th className="accident-report-label">사고 일시</th>
                    <td className="accident-report-value span-2" colSpan={2}>
                      <div className="accident-report-field-wrap">
                        <AccidentDatetimeField
                          value={form.accidentDatetime}
                          onChange={(value) => updateField('accidentDatetime', value)}
                        />
                      </div>
                    </td>
                  </tr>
                  <tr className="accident-report-standard-row">
                    <th className="accident-report-label">발생 장소</th>
                    <td className="accident-report-value span-2" colSpan={2}>
                      <div className="accident-report-field-wrap">
                        <SelectOrCustomField
                          id="accident-location"
                          value={form.location}
                          onChange={(value) => updateField('location', value)}
                          options={ACCIDENT_LOCATION_OPTIONS}
                          manualOption={LOCATION_MANUAL_OPTION}
                          ariaLabel="발생 장소"
                        />
                      </div>
                    </td>
                  </tr>
                  <tr className="accident-report-standard-row">
                    <th className="accident-report-label">프로그램</th>
                    <td className="accident-report-value span-2" colSpan={2}>
                      <div className="accident-report-field-wrap">
                        <SelectOrCustomField
                          id="accident-program"
                          value={form.programName}
                          onChange={(value) => updateField('programName', value)}
                          options={ACCIDENT_PROGRAM_OPTIONS}
                          manualOption={PROGRAM_MANUAL_OPTION}
                          ariaLabel="프로그램"
                        />
                      </div>
                    </td>
                  </tr>
                  <tr className="accident-report-standard-row">
                    <th className="accident-report-label">근무자</th>
                    <td className="accident-report-value span-2" colSpan={2}>
                      <div className="accident-report-field-wrap">
                        <WorkersField
                          id="accident-workers"
                          value={form.workers}
                          onChange={(value) => updateField('workers', value)}
                          ariaLabel="근무자"
                          compact
                        />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div ref={flexSectionRef} className="accident-report-flex-section">
                <table className="accident-report-table accident-report-table-body accident-report-table-body-flex">
                  <tbody>
                    <tr className="accident-report-flex-row" style={{ height: `${flexHeights.summary}px` }}>
                      <th className="accident-report-label">사고 내용</th>
                      <td className="accident-report-value span-2" colSpan={2}>
                        <div className="accident-report-field-wrap">
                          <FlexResizableField
                            id="accident-summary-field"
                            value={form.accidentSummary}
                            onChange={(value) => updateField('accidentSummary', value)}
                            ariaLabel="사고 내용"
                            rows={2}
                            rowHeight={flexHeights.summary}
                            minRowHeight={MIN_FLEX_ROW_HEIGHT}
                            maxRowHeight={getMaxFlexRowHeight(
                              flexHeights,
                              'summary',
                              flexTotalHeight,
                              MIN_FLEX_ROW_HEIGHT
                            )}
                            onRowHeightChange={(height) => handleFlexRowResize('summary', height)}
                          />
                        </div>
                      </td>
                    </tr>
                    <tr className="accident-report-flex-row" style={{ height: `${flexHeights.details}px` }}>
                      <th className="accident-report-label">사고 경위</th>
                      <td className="accident-report-value span-2" colSpan={2}>
                        <div className="accident-report-field-wrap">
                          <FlexResizableField
                            id="accident-details"
                            value={form.accidentDetails}
                            onChange={(value) => updateField('accidentDetails', value)}
                            ariaLabel="사고 경위"
                            rows={5}
                            rowHeight={flexHeights.details}
                            minRowHeight={MIN_FLEX_ROW_HEIGHT}
                            maxRowHeight={getMaxFlexRowHeight(
                              flexHeights,
                              'details',
                              flexTotalHeight,
                              MIN_FLEX_ROW_HEIGHT
                            )}
                            onRowHeightChange={(height) => handleFlexRowResize('details', height)}
                          />
                        </div>
                      </td>
                    </tr>
                    <tr className="accident-report-flex-row" style={{ height: `${flexHeights.cause}px` }}>
                      <th className="accident-report-label">사고 원인</th>
                      <td className="accident-report-value span-2" colSpan={2}>
                        <div className="accident-report-field-wrap">
                          <FlexResizableField
                            id="accident-cause"
                            value={form.accidentCause}
                            onChange={(value) => updateField('accidentCause', value)}
                            ariaLabel="사고 원인"
                            rows={5}
                            rowHeight={flexHeights.cause}
                            minRowHeight={MIN_FLEX_ROW_HEIGHT}
                            maxRowHeight={getMaxFlexRowHeight(
                              flexHeights,
                              'cause',
                              flexTotalHeight,
                              MIN_FLEX_ROW_HEIGHT
                            )}
                            onRowHeightChange={(height) => handleFlexRowResize('cause', height)}
                          />
                        </div>
                      </td>
                    </tr>
                    <tr className="accident-report-flex-row" style={{ height: `${flexHeights.followUp}px` }}>
                      <th className="accident-report-label">후속 조치</th>
                      <td className="accident-report-value span-2" colSpan={2}>
                        <div className="accident-report-field-wrap">
                          <FlexResizableField
                            id="follow-up-actions"
                            value={form.followUpActions}
                            onChange={(value) => updateField('followUpActions', value)}
                            ariaLabel="후속 조치"
                            rows={2}
                            rowHeight={flexHeights.followUp}
                            minRowHeight={MIN_FLEX_ROW_HEIGHT}
                            maxRowHeight={getMaxFlexRowHeight(
                              flexHeights,
                              'followUp',
                              flexTotalHeight,
                              MIN_FLEX_ROW_HEIGHT
                            )}
                            onRowHeightChange={(height) => handleFlexRowResize('followUp', height)}
                          />
                        </div>
                      </td>
                    </tr>
                    <tr className="accident-report-flex-row" style={{ height: `${flexHeights.other}px` }}>
                      <th className="accident-report-label accident-report-other-label">
                        <span className="accident-report-other-label-main">기타</span>
                        <span className="accident-report-improvement-hint">(개선방안)</span>
                      </th>
                      <td className="accident-report-value span-2" colSpan={2}>
                        <div className="accident-report-field-wrap">
                          <FlexResizableField
                            id="other-notes"
                            value={form.otherNotes}
                            onChange={(value) => updateField('otherNotes', value)}
                            ariaLabel="기타"
                            rows={2}
                            rowHeight={flexHeights.other}
                            minRowHeight={MIN_FLEX_ROW_HEIGHT}
                            maxRowHeight={getMaxFlexRowHeight(
                              flexHeights,
                              'other',
                              flexTotalHeight,
                              MIN_FLEX_ROW_HEIGHT
                            )}
                            onRowHeightChange={(height) => handleFlexRowResize('other', height)}
                          />
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
