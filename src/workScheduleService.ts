export const WORK_SCHEDULE_URL =
  import.meta.env.VITE_WORK_SCHEDULE_URL?.trim() ||
  'https://newseng.duckdns.org/Home/SchedulePage';

export const openWorkSchedule = (): void => {
  window.open(WORK_SCHEDULE_URL, '_blank', 'noopener,noreferrer');
};
