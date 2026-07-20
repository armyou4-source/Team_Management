import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, '')

const parseVerificationToken = (html: string): string | null => {
  const match =
    html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/) ??
    html.match(/value="([^"]+)"[^>]*name="__RequestVerificationToken"/)
  return match?.[1] ?? null
}

const workScheduleTokenPlugin = (): Plugin => ({
  name: 'work-schedule-token',
  configureServer(server) {
    server.middlewares.use('/api/work-schedule-token', async (_req, res) => {
      const scheduleUrl = normalizeBaseUrl(
        process.env.VITE_WORK_SCHEDULE_URL?.trim() || 'https://newseng.duckdns.org'
      )

      try {
        const response = await fetch(`${scheduleUrl}/`, {
          headers: { Accept: 'text/html' },
        })

        if (!response.ok) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(
            JSON.stringify({
              token: null,
              error: `근무표 로그인 페이지를 불러오지 못했습니다. (${response.status})`,
            })
          )
          return
        }

        const html = await response.text()
        const token = parseVerificationToken(html)

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            token,
            scheduleUrl,
            loginUrl: `${scheduleUrl}/Home/Login`,
          })
        )
      } catch {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ token: null, error: '근무표 서버에 연결하지 못했습니다.' }))
      }
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), workScheduleTokenPlugin()],
  appType: 'spa',
  preview: {
    host: true,
  },
  server: {
    host: true,
    port: 5173,
    strictPort: false,
  },
})
