const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, '');

export const WORK_SCHEDULE_URL = normalizeBaseUrl(
  import.meta.env.VITE_WORK_SCHEDULE_URL?.trim() || 'https://newseng.duckdns.org'
);

export const openWorkSchedule = (): void => {
  const link = document.createElement('a');
  link.href = WORK_SCHEDULE_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
