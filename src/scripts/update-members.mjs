/**
 * team_member 월간 CSV 동기화
 *
 * 사용법 (프로젝트 루트):
 *   node src/scripts/update-members.mjs
 *
 * .env 설정:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (권장 — RLS 우회)
 *   또는 VITE_SUPABASE_ANON_KEY (쓰기 권한 없으면 실패할 수 있음)
 *
 * DB 준비 (최초 1회):
 *   supabase/migrations/005_team_member_employment_status.sql 실행
 *
 * CSV 파일 (프로젝트 루트):
 *   News_Eng_General_7_26.csv
 *   News_Eng_Special_7_26.csv
 *   News_Eng_2years_7_26.csv
 */
import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const resolveProjectRoot = () => {
  const candidates = [join(__dirname, '..', '..'), process.cwd()];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'package.json'))) return dir;
  }
  return join(__dirname, '..', '..');
};

const ROOT = resolveProjectRoot();

const CSV_FILES = [
  join(ROOT, 'News_Eng_General_7_26.csv'),
  join(ROOT, 'News_Eng_Special_7_26.csv'),
  join(ROOT, 'News_Eng_2years_7_26.csv'),
];

const BATCH_SIZE = 100;

const loadEnv = () => {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) {
    console.warn(`.env 파일을 찾지 못했습니다: ${envPath}`);
    return;
  }

  readFileSync(envPath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) return;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      process.env[key] = value;
    });
};

const normalizeEmployeeId = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  if (/^E/i.test(raw)) {
    const digits = raw.replace(/^E/i, '').replace(/\D/g, '');
    return digits ? `E${digits.padStart(5, '0')}` : raw.toUpperCase();
  }

  const digits = raw.replace(/\D/g, '');
  return digits ? digits.padStart(6, '0') : raw;
};

const normalizeDate = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const slashMatch = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (slashMatch) {
    const [, y, m, d] = slashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return text;
};

/** RFC4180-style CSV parser (quoted fields, embedded newlines) */
const parseCsv = (content) => {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || (char === '\r' && next === '\n')) {
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) {
        rows.push(row.map((cell) => cell.trim()));
      }
      row = [];
      field = '';
      if (char === '\r') i += 1;
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== '')) {
      rows.push(row.map((cell) => cell.trim()));
    }
  }

  return rows;
};

const findHeaderRowIndex = (rows) => {
  const index = rows.findIndex((row) => row.some((cell) => cell.replace(/\s/g, '') === '사번'));
  if (index === -1) {
    throw new Error('CSV에서 "사번" 헤더 행을 찾지 못했습니다.');
  }
  return index;
};

const buildColumnIndex = (headers) => {
  const find = (name) =>
    headers.findIndex((header) => header.replace(/\s/g, '') === name.replace(/\s/g, ''));

  const columns = {
    사번: find('사번'),
    성명: find('성명'),
    직급: find('직급'),
    직위: find('직위'),
    소속: find('소속'),
    구분: find('구분'),
    생년월일: find('생년월일'),
    입사일: find('입사일'),
  };

  if (columns.사번 === -1) {
    throw new Error('CSV 헤더에 "사번" 컬럼이 없습니다.');
  }

  return columns;
};

const readMembersFromCsv = (filePath) => {
  if (!existsSync(filePath)) {
    throw new Error(`CSV 파일을 찾을 수 없습니다: ${filePath}`);
  }

  const raw = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const rows = parseCsv(raw);
  const headerIndex = findHeaderRowIndex(rows);
  const headers = rows[headerIndex];
  const columns = buildColumnIndex(headers);
  const members = [];

  for (const row of rows.slice(headerIndex + 1)) {
    const get = (key) => {
      const idx = columns[key];
      if (idx === undefined || idx < 0) return '';
      return String(row[idx] ?? '').trim();
    };

    const rawId = get('사번');
    if (!rawId) continue;

    members.push({
      rawId,
      normalizedId: normalizeEmployeeId(rawId),
      payload: {
        사번: rawId,
        성명: get('성명') || null,
        직급: get('직급') || null,
        직위: get('직위') || null,
        소속: get('소속') || null,
        구분: get('구분') || null,
        생년월일: normalizeDate(get('생년월일')),
        입사일: normalizeDate(get('입사일')),
        재직상태: '재직',
      },
    });
  }

  return members;
};

const mergeCsvMembers = (filePaths) => {
  const merged = new Map();

  for (const filePath of filePaths) {
    const members = readMembersFromCsv(filePath);
    for (const member of members) {
      merged.set(member.normalizedId, member);
    }
    console.log(`  - ${filePath.split(/[/\\]/).pop()}: ${members.length}명`);
  }

  return merged;
};

const chunk = (items, size) => {
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

const fetchAllTeamMembers = async (supabase) => {
  const all = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase.from('team_member').select('사번').range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data?.length) break;

    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
};

const resolveUpsertId = (member, dbIdByNormalized) =>
  dbIdByNormalized.get(member.normalizedId) ?? member.rawId;

loadEnv();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const apiKey = serviceRoleKey || anonKey;

if (!url || !apiKey) {
  console.error(
    'Supabase URL/Key가 필요합니다. .env에 VITE_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY(권장)를 설정하세요.'
  );
  process.exit(1);
}

if (!serviceRoleKey) {
  console.warn(
    '⚠️  SUPABASE_SERVICE_ROLE_KEY가 없어 anon key로 실행합니다. team_member 쓰기가 RLS에 막힐 수 있습니다.'
  );
} else {
  console.log('Supabase service role key 사용');
}

console.log(`프로젝트 루트: ${ROOT}\n`);

const supabase = createClient(url, apiKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log('CSV 읽는 중...');
const csvMembers = mergeCsvMembers(CSV_FILES);
console.log(`CSV 병합 결과: ${csvMembers.size}명\n`);

console.log('DB team_member 조회 중...');
const dbMembers = await fetchAllTeamMembers(supabase);
console.log(`DB 현재 인원: ${dbMembers.length}명\n`);

const dbIdByNormalized = new Map(
  dbMembers.map((row) => [normalizeEmployeeId(row.사번), String(row.사번)])
);

const upsertRows = [...csvMembers.values()].map((member) => ({
  ...member.payload,
  사번: resolveUpsertId(member, dbIdByNormalized),
}));

let upserted = 0;
for (const batch of chunk(upsertRows, BATCH_SIZE)) {
  const { error } = await supabase.from('team_member').upsert(batch, { onConflict: '사번' });
  if (error) {
    console.error('Upsert 실패:', error.message);
    if (error.code === '42703' && error.message.includes('재직상태')) {
      console.error(
        '\n재직상태 컬럼이 없습니다. Supabase SQL Editor에서\nsupabase/migrations/005_team_member_employment_status.sql 을 실행하세요.'
      );
    }
    process.exit(1);
  }
  upserted += batch.length;
}

const csvIdSet = new Set(csvMembers.keys());
const retireTargets = dbMembers
  .filter((row) => {
    const normalized = normalizeEmployeeId(row.사번);
    return normalized && !csvIdSet.has(normalized);
  })
  .map((row) => String(row.사번));

let retired = 0;
for (const batch of chunk(retireTargets, BATCH_SIZE)) {
  const { error } = await supabase
    .from('team_member')
    .update({ 재직상태: '퇴직' })
    .in('사번', batch);

  if (error) {
    console.error('퇴직 처리 실패:', error.message);
    process.exit(1);
  }
  retired += batch.length;
}

console.log('완료');
console.log(`  - CSV upsert(재직): ${upserted}명`);
console.log(`  - DB-only 퇴직 처리: ${retired}명`);
