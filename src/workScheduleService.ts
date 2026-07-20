export const WORK_SCHEDULE_URL = 'https://newseng.duckdns.org/Home/SchedulePage';

export const openWorkSchedule = (): void => {
  window.open(WORK_SCHEDULE_URL, '_blank', 'noopener,noreferrer');
};
