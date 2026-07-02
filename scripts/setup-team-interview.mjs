/**
 * team_interview 테이블 존재·읽기 권한 확인
 *
 * 테이블 생성: Supabase Dashboard → SQL Editor 에서
 *   supabase/migrations/001_create_team_interview.sql 실행
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const loadEnv = () => {
  try {
    const envText = readFileSync(join(root, '.env'), 'utf8');
    envText.split('\n').forEach((line) => {
      const [key, ...rest] = line.split('=');
      if (key && rest.length && !process.env[key.trim()]) {
        process.env[key.trim()] = rest.join('=').trim();
      }
    });
  } catch {
    // .env optional
  }
};

loadEnv();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 .env 에 필요합니다.');
  process.exit(1);
}

const supabase = createClient(url, key);
const migrationPath = 'supabase/migrations/001_create_team_interview.sql';

const { error: selectError } = await supabase.from('team_interview').select('사번').limit(1);

if (selectError?.code === 'PGRST205') {
  console.log(`
team_interview 테이블이 없습니다.

1. Supabase Dashboard → SQL Editor 열기
2. 아래 파일 내용을 복사해 실행:
   ${migrationPath}

3. 다시 확인: npm run db:check-interview
`);
  process.exit(1);
}

if (selectError) {
  console.error('테이블 조회 오류:', selectError.message);
  process.exit(1);
}

const probe = {
  사번: '__setup_probe__',
  성명: 'probe',
  상태: '미입력',
  updated_at: new Date().toISOString(),
};

const { error: insertError } = await supabase.from('team_interview').upsert(probe, {
  onConflict: '사번',
});

if (insertError) {
  console.error(`
team_interview 테이블은 있지만 저장 권한이 없습니다.

SQL Editor에서 ${migrationPath} 를 다시 실행해 GRANT·RLS 를 적용하세요.

오류: ${insertError.message}
`);
  process.exit(1);
}

await supabase.from('team_interview').delete().eq('사번', '__setup_probe__');

console.log('team_interview 테이블 준비 완료 (조회·저장 가능)');
