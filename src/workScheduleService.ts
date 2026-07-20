const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, '');

export const WORK_SCHEDULE_URL = normalizeBaseUrl(
  import.meta.env.VITE_WORK_SCHEDULE_URL?.trim() || 'https://newseng.duckdns.org'
);

export const WORK_SCHEDULE_USERNAME =
  import.meta.env.VITE_WORK_SCHEDULE_USERNAME?.trim() || 'admin';

export const WORK_SCHEDULE_PASSWORD =
  import.meta.env.VITE_WORK_SCHEDULE_PASSWORD?.trim() || 'mbcmbc';

const WORK_SCHEDULE_WINDOW_NAME = 'workScheduleWindow';
const LOGIN_PATH = '/Home/Login';

const fetchLoginToken = async (): Promise<string | null> => {
  try {
    const response = await fetch('/api/work-schedule-token');
    if (!response.ok) return null;
    const data = (await response.json()) as { token?: string | null };
    return data.token ?? null;
  } catch {
    return null;
  }
};

const appendHiddenField = (form: HTMLFormElement, name: string, value: string): void => {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = name;
  input.value = value;
  form.appendChild(input);
};

const submitLoginForm = (target: string, token: string): void => {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = `${WORK_SCHEDULE_URL}${LOGIN_PATH}`;
  form.target = target;
  form.style.display = 'none';

  appendHiddenField(form, 'Username', WORK_SCHEDULE_USERNAME);
  appendHiddenField(form, 'Password', WORK_SCHEDULE_PASSWORD);
  appendHiddenField(form, 'RememberMe', 'false');
  appendHiddenField(form, '__RequestVerificationToken', token);

  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
};

export const openWorkSchedule = (): void => {
  const popup = window.open(WORK_SCHEDULE_URL, WORK_SCHEDULE_WINDOW_NAME);
  if (!popup) {
    alert(
      '팝업이 차단되어 근무표를 열 수 없습니다.\n브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요.'
    );
    return;
  }

  void (async () => {
    const token = await fetchLoginToken();
    if (token && WORK_SCHEDULE_PASSWORD) {
      submitLoginForm(WORK_SCHEDULE_WINDOW_NAME, token);
    }
  })();
};
