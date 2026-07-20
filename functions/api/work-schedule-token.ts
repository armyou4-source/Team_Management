interface Env {
  VITE_WORK_SCHEDULE_URL?: string;
}

const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, '');

const parseVerificationToken = (html: string): string | null => {
  const match =
    html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/) ??
    html.match(/value="([^"]+)"[^>]*name="__RequestVerificationToken"/);
  return match?.[1] ?? null;
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const scheduleUrl = normalizeBaseUrl(
    env.VITE_WORK_SCHEDULE_URL?.trim() || 'https://newseng.duckdns.org'
  );

  try {
    const response = await fetch(`${scheduleUrl}/`, {
      headers: { Accept: 'text/html' },
    });

    if (!response.ok) {
      return Response.json(
        { token: null, error: `근무표 로그인 페이지를 불러오지 못했습니다. (${response.status})` },
        { status: 502 }
      );
    }

    const html = await response.text();
    const token = parseVerificationToken(html);

    return Response.json({
      token,
      scheduleUrl,
      loginUrl: `${scheduleUrl}/Home/Login`,
    });
  } catch {
    return Response.json(
      { token: null, error: '근무표 서버에 연결하지 못했습니다.' },
      { status: 502 }
    );
  }
};
