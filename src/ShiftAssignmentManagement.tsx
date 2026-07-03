import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DashboardEmployee } from './teamMemberService';
import {
  STANDARD_SHIFT_IDS,
  STANDARD_SHIFT_ROLES,
  STANDING_SHIFT_ROLES,
  buildEmptyAssignmentState,
  buildStandardAssignmentKey,
  buildStandingAssignmentKey,
  fetchShiftMembers,
  findEmployeeByMemberId,
  getShiftLabel,
  mapShiftMembersToAssignmentState,
  saveShiftAssignmentState,
  type ShiftAssignmentState,
} from './shiftService';
import './ShiftAssignmentManagement.css';

interface ShiftAssignmentManagementProps {
  employees: DashboardEmployee[];
}

function MemberNameLabel({
  employee,
  fallback = '(미배정)',
}: {
  employee: DashboardEmployee | undefined;
  fallback?: string;
}) {
  if (!employee) {
    return <span className="shift-member-empty">{fallback}</span>;
  }

  const grade = employee.grade?.trim() || '-';

  return (
    <span className="shift-member-label">
      <span className="shift-member-name">{employee.name}</span>
      <span className="shift-member-grade">{grade}</span>
    </span>
  );
}

export default function ShiftAssignmentManagement({
  employees,
}: ShiftAssignmentManagementProps) {
  const [assignments, setAssignments] = useState<ShiftAssignmentState>(
    buildEmptyAssignmentState
  );
  const [activeShiftId, setActiveShiftId] = useState<number>(1);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>(STANDARD_SHIFT_ROLES[0]);
  const [selectedStandingRole, setSelectedStandingRole] = useState<string>(
    STANDING_SHIFT_ROLES[0]
  );
  const [selectedStandingMemberId, setSelectedStandingMemberId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickerStatus, setPickerStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const memberOptions = useMemo(
    () =>
      [...employees].sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name, 'ko');
        if (nameCompare !== 0) return nameCompare;
        return a.id.localeCompare(b.id, 'ko');
      }),
    [employees]
  );

  const getEmployee = useCallback(
    (memberId: string) => findEmployeeByMemberId(memberOptions, memberId) as DashboardEmployee | undefined,
    [memberOptions]
  );

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const rows = await fetchShiftMembers();
      setAssignments(mapShiftMembersToAssignmentState(rows, memberOptions));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : '근무조 편성 정보를 불러오지 못했습니다.';
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [memberOptions]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    if (pickerStatus?.type !== 'success') return;

    const timer = window.setTimeout(() => {
      setPickerStatus(null);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [pickerStatus]);

  const handleStandardAssign = () => {
    if (!selectedMemberId || !selectedRole) return;
    const key = buildStandardAssignmentKey(activeShiftId, selectedRole);
    setAssignments((prev) => ({
      ...prev,
      standard: { ...prev.standard, [key]: selectedMemberId },
    }));
    setPickerStatus(null);
  };

  const handleStandardRemove = (shiftId: number, role: string) => {
    const key = buildStandardAssignmentKey(shiftId, role);
    setAssignments((prev) => ({
      ...prev,
      standard: { ...prev.standard, [key]: '' },
    }));
    setPickerStatus(null);
  };

  const handleStandingAdd = () => {
    if (!selectedStandingMemberId || !selectedStandingRole) return;
    const key = buildStandingAssignmentKey(selectedStandingRole);

    setAssignments((prev) => {
      const current = prev.standing[key] ?? [];
      if (current.includes(selectedStandingMemberId)) return prev;
      return {
        ...prev,
        standing: {
          ...prev.standing,
          [key]: [...current, selectedStandingMemberId],
        },
      };
    });
    setSelectedStandingMemberId('');
    setPickerStatus(null);
  };

  const handleStandingRemove = (role: string, memberId: string) => {
    const key = buildStandingAssignmentKey(role);
    setAssignments((prev) => ({
      ...prev,
      standing: {
        ...prev.standing,
        [key]: (prev.standing[key] ?? []).filter((id) => id !== memberId),
      },
    }));
    setPickerStatus(null);
  };

  const handleStandingPickerAction = () => {
    if (!selectedStandingMemberId || !selectedStandingRole) return;

    const key = buildStandingAssignmentKey(selectedStandingRole);
    const current = assignments.standing[key] ?? [];

    if (current.includes(selectedStandingMemberId)) {
      handleStandingRemove(selectedStandingRole, selectedStandingMemberId);
      setSelectedStandingMemberId('');
      return;
    }

    handleStandingAdd();
  };

  const handleSave = async () => {
    setSaving(true);
    setPickerStatus(null);
    setLoadError(null);

    try {
      await saveShiftAssignmentState(assignments, memberOptions);
      setPickerStatus({ type: 'success', message: '조 편성이 저장되었습니다.' });
      await loadAssignments();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : '조 편성 저장에 실패했습니다.';
      setPickerStatus({ type: 'error', message });
    } finally {
      setSaving(false);
    }
  };

  const standingMemberIds =
    assignments.standing[buildStandingAssignmentKey(selectedStandingRole)] ?? [];
  const isStandingMemberSelected = standingMemberIds.includes(selectedStandingMemberId);

  const isBusy = loading || saving;

  const renderStandardMatrix = () => (
    <div className="shift-matrix-wrap">
      <table className="shift-matrix">
        <thead>
          <tr>
            <th className="shift-matrix-role-col">직무</th>
            {STANDARD_SHIFT_IDS.map((shiftId) => (
              <th key={shiftId} className="shift-matrix-shift-col">
                {getShiftLabel(shiftId)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STANDARD_SHIFT_ROLES.map((role) => (
            <tr key={role}>
              <th className="shift-matrix-role-label">{role}</th>
              {STANDARD_SHIFT_IDS.map((shiftId) => {
                const key = buildStandardAssignmentKey(shiftId, role);
                const memberId = assignments.standard[key] ?? '';
                const employee = memberId ? getEmployee(memberId) : undefined;

                return (
                  <td
                    key={key}
                    className={`shift-matrix-cell-td${memberId ? '' : ' empty'}`}
                  >
                    <div className="shift-matrix-cell">
                      <MemberNameLabel employee={employee} />
                      {memberId && (
                        <button
                          type="button"
                          className="shift-member-remove-btn inline"
                          onClick={() => handleStandardRemove(shiftId, role)}
                          disabled={isBusy}
                          aria-label={`${getShiftLabel(shiftId)} ${role} 담당자 제거`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const handleStandingRoleSelect = (role: string) => {
    setSelectedStandingRole(role);
  };

  const renderStandingRoleBlock = (role: string) => {
    const key = buildStandingAssignmentKey(role);
    const memberIds = assignments.standing[key] ?? [];
    const isSelected = selectedStandingRole === role;

    return (
      <section
        key={key}
        className={`shift-standing-role-block${isSelected ? ' selected' : ''}`}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        aria-label={`${role} 직무 선택`}
        onClick={() => handleStandingRoleSelect(role)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleStandingRoleSelect(role);
          }
        }}
      >
        <h5 className="shift-standing-role-title">{role}</h5>
        <ul className="shift-member-summary-list standing">
          {memberIds.length === 0 ? (
            <li className="shift-member-summary-item empty">배정된 인원 없음</li>
          ) : (
            memberIds.map((memberId) => {
              const employee = getEmployee(memberId);
              return (
                <li key={`${key}-${memberId}`} className="shift-standing-summary-item">
                  <MemberNameLabel employee={employee} fallback={memberId} />
                  <button
                    type="button"
                    className="shift-member-remove-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleStandingRemove(role, memberId);
                    }}
                    disabled={isBusy}
                    aria-label={`${role} ${employee?.name ?? memberId} 배정 취소`}
                  >
                    ×
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </section>
    );
  };

  return (
    <section className="dept-detail-card shift-assignment-card">
      <div className="dept-detail-header">
        <div>
          <h3 className="dept-detail-title">근무조 및 직무 편성</h3>
          <p className="dept-detail-subtitle">
            1조~6조 기본 편성과 상시 직무 담당자를 관리합니다.
          </p>
        </div>
      </div>

      {loadError && <div className="shift-status-message error">{loadError}</div>}

      <div className="shift-assignment-layout vertical">
        <div className="shift-standard-section">
          <h4 className="shift-section-title">기본 근무조</h4>
          {loading ? (
            <div className="shift-loading">편성 정보를 불러오는 중...</div>
          ) : (
            renderStandardMatrix()
          )}
        </div>

        <div className="shift-standing-section">
          <h4 className="shift-section-title">상시 직무</h4>
          <p className="shift-section-desc">
            아래 팀원 선택 영역에서 배정한 인원이 표시됩니다. × 버튼으로 배정을 취소할 수 있습니다.
          </p>
          <div className="shift-standing-role-row">
            {loading
              ? STANDING_SHIFT_ROLES.map((role) => (
                  <div key={role} className="shift-standing-role-block skeleton">
                    <h5 className="shift-standing-role-title">{role}</h5>
                  </div>
                ))
              : STANDING_SHIFT_ROLES.map((role) => renderStandingRoleBlock(role))}
          </div>
        </div>

        <div className="shift-member-picker-panel bottom">
          <div className="shift-picker-panel-header">
            <h4 className="shift-picker-section-title">팀원 선택 · 직무 배정</h4>
            <button
              type="button"
              className="shift-save-btn"
              onClick={() => void handleSave()}
              disabled={isBusy}
            >
              {saving ? '저장 중...' : '조 편성 저장'}
            </button>
          </div>

          {pickerStatus && (
            <div
              className={`shift-status-message picker${pickerStatus.type === 'success' ? ' success' : ' error'}`}
              role="status"
            >
              {pickerStatus.message}
            </div>
          )}

          <div className="shift-picker-blocks">
            <section className="shift-picker-block">
              <h5 className="shift-picker-title">기본 근무조 배정</h5>
              <div className="shift-tab-list compact">
                {STANDARD_SHIFT_IDS.map((shiftId) => (
                  <button
                    key={shiftId}
                    type="button"
                    className={`shift-tab${activeShiftId === shiftId ? ' selected' : ''}`}
                    onClick={() => setActiveShiftId(shiftId)}
                    disabled={isBusy}
                  >
                    {getShiftLabel(shiftId)}
                  </button>
                ))}
              </div>
              <div className="shift-picker-controls">
                <label className="shift-role-field inline">
                  <span className="shift-role-label">직무</span>
                  <select
                    className="shift-role-select"
                    value={selectedRole}
                    onChange={(event) => setSelectedRole(event.target.value)}
                    disabled={isBusy}
                  >
                    {STANDARD_SHIFT_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="shift-add-member-btn"
                  onClick={handleStandardAssign}
                  disabled={isBusy || !selectedMemberId}
                >
                  {getShiftLabel(activeShiftId)} · {selectedRole}에 배정
                </button>
              </div>
            </section>

            <section className="shift-picker-block">
              <h5 className="shift-picker-title">상시 직무 배정</h5>
              <div className="shift-picker-controls">
                <label className="shift-role-field inline">
                  <span className="shift-role-label">직무</span>
                  <select
                    className="shift-role-select"
                    value={selectedStandingRole}
                    onChange={(event) => setSelectedStandingRole(event.target.value)}
                    disabled={isBusy}
                  >
                    {STANDING_SHIFT_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={`shift-add-member-btn${isStandingMemberSelected ? ' remove' : ''}`}
                  onClick={handleStandingPickerAction}
                  disabled={isBusy || !selectedStandingMemberId}
                >
                  {isStandingMemberSelected
                    ? `${selectedStandingRole}에서 제거`
                    : `${selectedStandingRole}에 추가`}
                </button>
              </div>
            </section>
          </div>

          <div className="shift-member-picker-list horizontal">
            {memberOptions.map((employee) => {
              const isStandardSelected = selectedMemberId === employee.id;
              const isStandingSelected = selectedStandingMemberId === employee.id;
              const isStandingTaken = standingMemberIds.includes(employee.id);

              return (
                <button
                  key={employee.id}
                  type="button"
                  className={`shift-member-pick-btn${isStandardSelected || isStandingSelected ? ' selected' : ''}${isStandingTaken && !isStandingSelected ? ' taken' : ''}`}
                  onClick={() => {
                    setSelectedMemberId(employee.id);
                    setSelectedStandingMemberId(employee.id);
                  }}
                  disabled={isBusy}
                >
                  <MemberNameLabel employee={employee} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
