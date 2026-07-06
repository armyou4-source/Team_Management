export const WORK_SCHEDULE_URL =
  import.meta.env.VITE_WORK_SCHEDULE_URL?.trim() || 'http://112.216.158.94:34567';

export const openWorkSchedule = (): void => {
  window.open(WORK_SCHEDULE_URL, '_blank', 'noopener,noreferrer');
};
