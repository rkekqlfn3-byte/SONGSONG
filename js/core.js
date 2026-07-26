/* ============================================================
   1. 공용 유틸
   ============================================================ */
const $ = (s, r) => (r || document).querySelector(s);
const el = (t, cls, txt) => { const n = document.createElement(t); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DAY = 86400000;
const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
const WD = ['일', '월', '화', '수', '목', '금', '토'];

/** 엑셀 serial(1899-12-30 기준) → Date. 날짜가 아니면 null */
function toDate(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Math.round(parseFloat(s));
  if (n < 20000 || n > 80000) return null;      // 1954~2119 범위 밖은 날짜가 아님
  return new Date(1899, 11, 30 + n);
}
const iso = d => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
const md = d => d ? `${d.getMonth() + 1}/${d.getDate()}` : '';
const korDate = d => d ? `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일(${WD[d.getDay()]})` : '';
const daysFromToday = d => d ? Math.round((d - TODAY) / DAY) : null;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** '6/22' · '0622' · '6-22' · '6.22' → {m,d}. 그 외 형식은 null */
function parseMonthDay(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return null;
  const sep = s.match(/^(\d{1,2})\s*[./\-]\s*(\d{1,2})$/);
  const packed = /^\d{3,4}$/.test(s) ? [null, s.slice(0, -2), s.slice(-2)] : null;
  const hit = sep || packed;
  if (!hit) return null;
  const m = +hit[1], d = +hit[2];
  return (m >= 1 && m <= 12 && d >= 1 && d <= 31) ? { m, d } : null;
}
/** 월/일 + 기준 연도 → Date. 2/30처럼 없는 날짜는 null */
function monthDayToDate(text, year) {
  const p = parseMonthDay(text);
  if (!p) return null;
  const d = new Date(year, p.m - 1, p.d);
  return (d.getMonth() === p.m - 1 && d.getDate() === p.d) ? d : null;
}
/** 기준 연도와 같은 해면 6/22, 넘어가면 2027. 1/17 */
const mdWithYear = (d, year) => !d ? '' : (d.getFullYear() === year ? md(d) : `${d.getFullYear()}. ${md(d)}`);
/** yyyy-mm-dd → Date */
const isoToDate = s => {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
/** Date → 엑셀 serial. 시트가 돌려주는 형식과 맞춰야 화면 표시가 어긋나지 않는다 */
const serialOf = d => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(1899, 11, 30)) / DAY);
/** 서류 셀 표시 — 약정기간은 '시작 ~ 12/31' 이라 앞 날짜만 보여준다 */
function docCellText(v) {
  const raw = String(v == null ? '' : v).trim();
  if (!raw) return '';
  if (raw.indexOf('~') >= 0) {
    const head = isoToDate(raw.split('~')[0].trim());
    return head ? md(head) : raw;
  }
  return cellText(raw);
}

/** 값이 들어있으면 true (날짜든 O 표시든) */
const filled = v => v != null && String(v).trim() !== '';
/** 셀을 화면용 문자열로 — 날짜면 m/d, 아니면 원문 */
const cellText = v => { const d = toDate(v); return d ? md(d) : String(v || '').trim(); };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
/** 되돌릴 수 있는 알림 — 클릭 한 번으로 저장되는 O 표시처럼 실수하기 쉬운 동작에 쓴다 */
function toastUndo(msg, onUndo) {
  const t = $('#toast');
  t.textContent = msg + ' ';
  const b = el('button', 'toast-undo', '되돌리기');
  b.onclick = () => { t.classList.remove('show'); onUndo(); };
  t.appendChild(b);
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 5200);
}
async function copy(text, label) {
  try { await navigator.clipboard.writeText(text); toast(`${label} 복사됨`); }
  catch { // file:// 등 clipboard API가 막힌 환경 대비
    const ta = el('textarea'); ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); ta.remove(); toast(`${label} 복사됨`);
  }
}

/* ============================================================
   2. xlsx 읽기 — 브라우저 내장 기능만 사용 (외부 라이브러리 없음)
   ============================================================ */
async function inflateRaw(u8) {
  const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** ZIP 중앙 디렉터리를 읽어 필요한 xml만 풀어낸다 */
async function unzip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= 0 && i > u8.length - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP(xlsx) 형식이 아닙니다.');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const out = {};
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const cmtLen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nameLen));
    if (/\.(xml|rels)$/i.test(name)) {
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      const raw = u8.subarray(start, start + csize);
      out[name] = method === 0 ? raw : await inflateRaw(raw);
    }
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

const colIndex = ref => {
  let n = 0;
  for (const ch of ref.match(/^[A-Z]+/)[0]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** xlsx 파일 → { 탭이름: 2차원 배열 } */
async function readXlsx(file) {
  const files = await unzip(new Uint8Array(await file.arrayBuffer()));
  const dec = new TextDecoder('utf-8');
  const P = p => {
    if (!files[p]) throw new Error(`시트 구조를 읽을 수 없습니다 (${p} 없음)`);
    const doc = new DOMParser().parseFromString(dec.decode(files[p]), 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('시트 XML 해석에 실패했습니다.');
    return doc;
  };

  const shared = [];
  if (files['xl/sharedStrings.xml']) {
    for (const si of P('xl/sharedStrings.xml').getElementsByTagName('si')) {
      shared.push([...si.getElementsByTagName('t')].map(t => t.textContent).join(''));
    }
  }
  const relmap = {};
  for (const r of P('xl/_rels/workbook.xml.rels').getElementsByTagName('Relationship')) {
    relmap[r.getAttribute('Id')] = r.getAttribute('Target');
  }

  const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const sheets = {};
  for (const sh of P('xl/workbook.xml').getElementsByTagName('sheet')) {
    const rid = sh.getAttributeNS(RNS, 'id') || sh.getAttribute('r:id');
    let target = relmap[rid] || '';
    if (!target.startsWith('xl/')) target = 'xl/' + target.replace(/^\//, '');
    const sd = P(target).getElementsByTagName('sheetData')[0];
    const grid = [];
    if (sd) {
      for (const row of sd.children) {
        const cells = {}; let maxc = -1;
        for (const c of row.children) {
          const ref = c.getAttribute('r');
          const ci = ref ? colIndex(ref) : 0;
          const t = c.getAttribute('t');
          let v = '';
          if (t === 'inlineStr') {
            v = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
          } else {
            const ve = c.getElementsByTagName('v')[0];
            if (ve) v = t === 's' ? (shared[+ve.textContent] || '') : ve.textContent;
          }
          v = v.replace(/\r\n/g, '\n').trim();
          if (v) { cells[ci] = v; maxc = Math.max(maxc, ci); }
        }
        const arr = []; for (let i = 0; i <= maxc; i++) arr.push(cells[i] || '');
        grid.push(arr);
      }
    }
    while (grid.length && !grid[grid.length - 1].some(x => x)) grid.pop();
    sheets[sh.getAttribute('name')] = grid;
  }
  return sheets;
}

/* ============================================================
   3. 정규화 — 원시 그리드 → 화면이 쓰는 모델
   ============================================================ */
const TAB_DOCS = '서류', TAB_SOURCE = '작성', TAB_SOURCE_LEGACY = 'AI훈련로드맵', TAB_COACH = '훈련코치', TAB_MAIL = '메일DB';

/** 예전 '작성' 탭 열 인덱스(0부터) */
const SRC_LEGACY = {
  owner: 0,        // A 담당자
  status: 1,       // B 진행현황
  name: 2,         // C 기업명
  coachName: 3,    // D 코치
  coachEmail: 4,   // E 메일
  coachPhone: 5,   // F 연락처
  start: 6,        // G 컨설팅 시작
  end: 7,          // H 종료기한
  employeeCount: 9,// J 근로자수 (GViz가 숫자 열의 텍스트 헤더를 누락할 때 쓰는 안전한 기본값)
  workplaceNumber: 10, // K 앞쪽 사업장 관리번호
  companyAddress: 11,  // L 주소
  agencyBranch: 12,    // M 공단지사
  hrd4uId: 14,         // O HRD4U
  contactName: 18, // S 담당자
  contactTitle: 19,// T 직급
  contactPhone: 20,// U 전화번호
  contactEmail: 21 // V 이메일
};
/** 현재 'AI훈련로드맵' 탭 열 인덱스(0부터) */
const SRC_DASHBOARD = {
  status: 0,       // A 진행현황
  owner: 1,        // B 담당자
  name: 2,         // C 기업명
  contactName: 3,  // D 기업 담당자
  contactTitle: 4, // E 직급
  contactPhone: 5, // F 전화번호
  contactEmail: 6, // G 이메일
  start: 7,        // H 컨설팅 시작
  end: 8,          // I 종료기한
  coachName: 9,    // J 코치
  coachEmail: 10,  // K 코치 이메일
  coachPhone: 11   // L 코치 연락처
};

const SOURCE_EXTRA_HEADERS = {
  employeeCount: ['근로자수'],
  // 공백 유무가 다른 중복 헤더가 있으면 시트의 가장 앞쪽 열을 사용한다.
  workplaceNumber: ['사업장 관리번호', '사업장관리번호'],
  companyAddress: ['주소'],
  agencyBranch: ['공단지사'],
  // «HRD4U ID»는 의도적으로 후보에 넣지 않는다.
  hrd4uId: ['HRD4U'],
  twoWeekExtension: ['2주 연장'],
  visitOwner: ['담당'],
  visitDate: ['일자'],
  visitTime: ['시간'],
  consult1Date: ['1차 컨설팅일'],
  consult1Time: ['1차 시간'],
  consult1Visit: ['1차 방문'],
  consult1Owner: ['1차 담당'],
  consult2Date: ['2차 컨설팅일'],
  consult2Time: ['2차 시간'],
  consult2Visit: ['2차 방문'],
  consult2Owner: ['2차 담당'],
};
function withSourceExtraColumns(base, header) {
  const columns = { ...base };
  if (!header) return columns;
  const cells = header.map(v => String(v || '').trim());
  Object.entries(SOURCE_EXTRA_HEADERS).forEach(([key, labels]) => {
    // 셀 순서대로 찾으므로 같은 의미의 헤더가 여러 개면 항상 앞쪽 열이 선택된다.
    const index = cells.findIndex(cell => labels.includes(cell));
    if (index >= 0) columns[key] = index;
  });
  return columns;
}

/** 같은 이름의 탭이라도 파일 버전에 따라 A/B 열 순서가 달라 헤더와 실제 상태값으로 구조를 판별한다 */
function detectSourceColumns(grid) {
  const rows = grid || [];
  const header = rows.find(r => r.some(v => String(v || '').trim() === '기업명'));
  let base = null;
  if (header) {
    const statusIndex = header.findIndex(v => String(v || '').trim() === '진행현황');
    if (statusIndex === SRC_DASHBOARD.status) base = SRC_DASHBOARD;
    if (statusIndex === SRC_LEGACY.status) base = SRC_LEGACY;
  }
  if (!base) {
    const known = new Set(STATUS.map(s => s.k));
    const score = index => rows.reduce((n, r) => n + (known.has(String(r[index] || '').trim()) ? 1 : 0), 0);
    base = score(SRC_DASHBOARD.status) > score(SRC_LEGACY.status) ? SRC_DASHBOARD : SRC_LEGACY;
  }
  return withSourceExtraColumns(base, header);
}

/**
 * 서류 탭 컬럼 정의 (A:T). i = 열 인덱스, byCoach = 코치 마스터에서 채워지는 파생 컬럼
 * type = 시트에 들어가는 값의 형태. 기업 추가 폼 입력 칸도 이 값을 따른다.
 *   date  — 월/일 입력, 기준 연도가 붙어 날짜로 저장
 *   mark  — O 표시 체크박스
 *   range — '시작 ~ 12/31' 기간. 앞 날짜만 입력하고 뒤는 기준 연도 마지막 날로 고정
 *   auto  — 사람이 못 고치는 계산값 (약정 종료일 = 시작일 + 28일)
 * order = 이 순서대로 날짜가 같거나 뒤여야 한다 (컨설팅신청서 ≤ … ≤ 약정 시작일)
 */
const DOC_DEFS = [
  { k: 'bizApply',  i: 5,  stage: '신청', label: '사업 참여 신청서', short: '사업참여\n신청서', type: 'mark' },
  { k: 'consult',   i: 6,  stage: '신청', label: '컨설팅 신청서',    short: '컨설팅\n신청서', type: 'date', order: 1 },
  { k: 'contract',  i: 7,  stage: '확정', label: '표준 협약서',      short: '표준\n협약서', type: 'date', order: 2 },
  { k: 'teamWrite', i: 8,  stage: '확정', label: '팀 약정서 · 작성일', short: '약정서\n작성일', type: 'date', order: 3 },
  { k: 'teamTerm',  i: 9,  stage: '확정', label: '팀 약정서 · 약정기간', short: '약정\n기간', type: 'range', order: 4 },
  { k: 'teamStart', i: 10, stage: '확정', label: '팀 약정서 · 시작일', short: '약정\n시작일', type: 'date', order: 5 },
  { k: 'teamEnd',   i: 11, stage: '확정', label: '팀 약정서 · 종료일', short: '약정\n종료일', type: 'auto' },
  { k: 'privacy',   i: 12, stage: '확정', label: '개인정보 수집 동의 [서식8]',  short: '서식8\n개인정보', byCoach: 'f8', type: 'date' },
  { k: 'share',     i: 13, stage: '확정', label: '정보공유 동의 [서식9]',      short: '서식9\n정보공유', byCoach: 'f9', type: 'date' },
  { k: 'join',      i: 14, stage: '확정', label: '사업 참여 서약 [서식10]',    short: '서식10\n참여서약', byCoach: 'f10', type: 'date' },
  { k: 'log1',      i: 15, stage: '실시', label: '컨설팅 수행일지 1차', short: '수행일지\n1차', type: 'date' },
  { k: 'log2',      i: 16, stage: '실시', label: '컨설팅 수행일지 2차', short: '수행일지\n2차', type: 'date' },
  { k: 'report',    i: 17, stage: '실시', label: 'AI훈련로드맵 보고서', short: '보고서', type: 'date' },
  { k: 'payslip',   i: 18, stage: '지급', label: '수당지급 명세서 [서식7]', short: '수당\n명세서', type: 'mark' },
  { k: 'bankbook',  i: 19, stage: '지급', label: '통장 사본',        short: '통장\n사본', byCoach: 'bank', type: 'mark' },
];
const byDocKey = k => DOC_DEFS.find(d => d.k === k);
/** 기업 추가·기본정보 수정 폼에서는 코치 공통 서류를 읽기 전용으로 보여준다 */
const docLocked = d => !!d.byCoach;
/** 서류 현황·상세창에서는 코치 공통 서류도 수정할 수 있고, 자동 계산 열만 잠근다 */
const docEditable = d => d.type !== 'auto';
const STAGES = ['신청', '확정', '실시', '지급'];

/** 진행현황 — 순서 = 파이프라인 진행 방향. term=종료(비활성) 상태 */
const STATUS = [
  { k: '검토요청',   v: '--p0' },
  { k: '검토완료',   v: '--p1' },
  { k: '컨설팅진행', v: '--p2' },
  { k: '보고서제출', v: '--p3' },
  { k: '지급준비',   v: '--p4' },
  { k: '지급완료',   v: '--p5', done: true },
  { k: '기타',       term: true },
  { k: '신청불가',   term: true },
  { k: '신청취소',   term: true },
];
const statusMeta = k => STATUS.find(s => s.k === k) || { k: k || '미분류', term: true };
/** 마감 관리 대상 — 아직 굴러가고 있는 건들 */
const ACTIVE = new Set(['검토요청', '검토완료', '컨설팅진행', '보고서제출', '지급준비']);
const ACTIVE_STATUS_FILTER = '__active__';

/**
 * 데이터 행만 골라낸다. 시트마다 위쪽 안내·헤더 줄 수가 다르고 사람이 늘리거나 지우기도 해서,
 * 몇 줄을 건너뛸지 정해두는 대신 «기준 칸이 비었거나 헤더 글자면 건너뛴다»로 판단한다.
 */
function dataRows(grid, keyIndex, headerLabel) {
  return (grid || []).filter(r => {
    const key = (r[keyIndex] || '').trim();
    return key && key !== headerLabel;
  });
}

function normalize(raw) {
  const S = raw.sheets || {};
  // 예전 파일의 '작성' 탭과 현재 파일의 'AI훈련로드맵' 탭을 모두 읽는다.
  const sourceGrid = S[TAB_SOURCE] || S[TAB_SOURCE_LEGACY];
  const sourceColumns = detectSourceColumns(sourceGrid);
  const need = [
    [TAB_DOCS, S[TAB_DOCS]],
    [`${TAB_SOURCE} 또는 ${TAB_SOURCE_LEGACY}`, sourceGrid],
    [TAB_COACH, S[TAB_COACH]],
    [TAB_MAIL, S[TAB_MAIL]],
  ].filter(([, grid]) => !grid).map(([name]) => name);
  if (need.length) throw new Error(`시트 탭을 찾을 수 없습니다: ${need.join(', ')}`);

  // --- 코치 마스터 ---
  const coaches = [];
  const coachBy = new Map();
  for (const r of dataRows(S[TAB_COACH], 1, '코치')) {
    const name = (r[1] || '').trim();
    const c = {
      name, owner: (r[0] || '').trim(), phone: (r[2] || '').trim(), email: (r[3] || '').trim(),
      loginId: (r[4] || '').trim(), birth: (r[5] || '').trim(), address: (r[6] || '').trim(),
      f8: (r[7] || '').trim(), f9: (r[8] || '').trim(), f10: (r[9] || '').trim(), bank: (r[10] || '').trim(),
      companies: [],
    };
    coaches.push(c); coachBy.set(name, c);
  }

  // --- 서류 탭 → 기업명 기준 색인 ---
  const docsBy = new Map();
  for (const r of dataRows(S[TAB_DOCS], 3, '기업')) {
    const name = (r[3] || '').trim();
    const d = { done: (r[0] || '').trim(), rowStatus: (r[1] || '').trim(), rowOwner: (r[2] || '').trim(), coach: (r[4] || '').trim() };
    for (const def of DOC_DEFS) d[def.k] = (r[def.i] || '').trim();
    docsBy.set(name, d);
  }

  // --- 기업 마스터 = 작성 탭 ---
  const companies = [];
  const cell = (r, key) => {
    const index = sourceColumns[key];
    return index == null ? '' : String(r[index] || '').trim();
  };
  const sourceRows = dataRows(sourceGrid, sourceColumns.name, '기업명')
    .filter(r => String(r[sourceColumns.name] || '').trim() !== '기업');
  for (const r of sourceRows) {
    const name = cell(r, 'name');
    const docs = docsBy.get(name) || {};
    const coachName = cell(r, 'coachName') || docs.coach || '';
    const coach = coachBy.get(coachName) || null;

    // 코치 동의서 3종과 통장사본은 코치 기준 파생값 — 코치 마스터를 우선한다
    for (const def of DOC_DEFS) if (def.byCoach) docs[def.k] = (coach && coach[def.byCoach]) || docs[def.k] || '';

    const c = {
      name,
      status: cell(r, 'status') || '미분류',
      owner: cell(r, 'owner'),
      contact: {
        name: cell(r, 'contactName'), title: cell(r, 'contactTitle'),
        phone: cell(r, 'contactPhone'), email: cell(r, 'contactEmail'),
      },
      workplace: {
        employeeCount: cell(r, 'employeeCount'),
        managementNumber: cell(r, 'workplaceNumber'),
        address: cell(r, 'companyAddress'),
        agencyBranch: cell(r, 'agencyBranch'),
        hrd4uId: cell(r, 'hrd4uId'),
      },
      startRaw: cell(r, 'start'), endRaw: cell(r, 'end'),
      consultations: [
        {
          dateRaw: cell(r, 'consult1Date'),
          // 기존 작성 탭은 1차 시간이 별도 확장 열이 아니라 방문 '시간' 열(R)에 저장되어 있다.
          // 새 '1차 시간' 열의 값을 우선하고, 비어 있을 때만 기존 열을 읽어 이전 데이터도 보존한다.
          time: cell(r, 'consult1Time') || cell(r, 'visitTime'),
          visit: filled(cell(r, 'consult1Visit')),
          owner: cell(r, 'consult1Owner'),
        },
        {
          dateRaw: cell(r, 'consult2Date'),
          time: cell(r, 'consult2Time'),
          visit: filled(cell(r, 'consult2Visit')),
          owner: cell(r, 'consult2Owner'),
        },
      ],
      latestVisit: {
        owner: cell(r, 'visitOwner'),
        dateRaw: cell(r, 'visitDate'),
        time: cell(r, 'visitTime'),
      },
      extensionRaw: cell(r, 'twoWeekExtension'),
      extensionStored: sourceColumns.twoWeekExtension != null,
      coachName, coach,
      // 기업 행에 별도 연락처가 있으면 그 값을 보존하고, 비어 있을 때만 코치 마스터를 쓴다.
      coachEmail: (cell(r, 'coachEmail') === '0' ? '' : cell(r, 'coachEmail')) || (coach && coach.email) || '',
      coachPhone: (cell(r, 'coachPhone') === '0' ? '' : cell(r, 'coachPhone')) || (coach && coach.phone) || '',
      docs,
    };
    c.start = toDate(c.startRaw);
    c.end = toDate(c.endRaw);
    c.consultations.forEach(item => { item.date = toDate(item.dateRaw); });
    c.latestVisit.date = toDate(c.latestVisit.dateRaw);
    c.startNote = c.start ? '' : c.startRaw;     // '8월초' 같은 자유 입력 보존
    updateCompanyDeadline(c);
    c.docCount = DOC_DEFS.filter(d => filled(docs[d.k])).length;
    companies.push(c);
    if (coach) coach.companies.push(c);
  }

  // --- 메일 템플릿 ---
  const templates = [];
  for (const r of (S[TAB_MAIL] || [])) {
    if (!(r[0] || '').includes('|') || !(r[1] || '').trim()) continue;   // 템플릿 ID에 | 가 있는 행만
    templates.push({
      id: r[0].trim(), service: (r[1] || '').trim(), stage: (r[2] || '').trim(), target: (r[3] || '').trim(),
      sendWhen: (r[4] || '').trim(), schedName: (r[5] || '').trim(), schedSrc: (r[6] || '').trim(),
      subject: (r[7] || '').trim(), body: (r[8] || '').trim(), attach: (r[9] || '').trim(),
    });
  }
  if (!companies.length) throw new Error('기업 데이터를 한 건도 읽지 못했습니다. 시트 형식을 확인하세요.');

  return { generatedAt: raw.generatedAt || iso(TODAY), companies, coaches, templates, docsBy };
}

/* ============================================================
   4. 앱 상태
   ============================================================ */
const TABS = [
  { k: 'dash',   t: '대시보드' },
  { k: 'comp',   t: '기업' },
  { k: 'coach',  t: '코치' },
  { k: 'docs',   t: '서류 현황' },
  { k: 'mail',   t: '메일 작성기' },
];
const state = {
  tab: 'dash',
  M: null,                                   // 정규화 모델
  src: '내장 스냅샷',
  comp:  { q: '', status: '', owner: '', coach: '', initial: '', sort: 'end', dir: 1, sel: null },
  coach: { q: '', sort: 'name', dir: 1, sel: null, reveal: false },
  docs:  { q: '', stage: '', missingOnly: false },
  mail:  { stage: '신청단계', target: '기업 담당자', company: '', manual: '' },
};

const VIEW = $('#view');
function render() {
  // 검색창에서 타이핑 중이었다면 다시 그린 뒤 포커스와 캐럿을 되살린다
  const wasSearching = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.role === 'search';
  // 서류 칸을 편집하던 중에 화면을 갈아끼우면 입력칸이 통째로 사라진다.
  // 잠금을 풀어두지 않으면 그 뒤로 편집이 영영 막힌다.
  docEditing = false;
  liveSearch = null;                          // 새로 그리는 화면이 자기 것으로 다시 채운다

  renderTabs();
  const f = { dash: viewDash, comp: viewCompanies, coach: viewCoaches, docs: viewDocs, mail: viewMail }[state.tab];
  VIEW.innerHTML = '';
  VIEW.appendChild(f());
  if (typeof enhanceSearchableSelects === 'function') enhanceSearchableSelects(VIEW);

  if (wasSearching) {
    const inp = VIEW.querySelector('[data-role="search"]');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  } else {
    const topbar = $('.topbar');
    const y = VIEW.getBoundingClientRect().top + scrollY - (topbar ? topbar.offsetHeight : 0);
    scrollTo({ top: Math.max(0, y), behavior: 'auto' });
  }
}
function go(tab, patch) {
  if (patch) Object.assign(state[tab], patch);
  state.tab = tab; closeDrawer(); render();
}
function renderTabs() {
  const n = state.M;
  const counts = { comp: n.companies.length, coach: n.coaches.length, docs: n.companies.length };
  $('#tabs').innerHTML = TABS.map(t =>
    `<button class="tab" role="tab" data-tab="${t.k}" aria-selected="${t.k === state.tab}">${t.t}` +
    (counts[t.k] ? `<span class="cnt">${counts[t.k]}</span>` : '') + `</button>`).join('');
}

/* 공용 조각 ------------------------------------------------ */
function badge(status) {
  const m = statusMeta(status);
  const cls = m.done ? 's-done' : m.term ? 's-off' : '';
  const style = m.v ? ` style="color:var(${m.v})"` : '';
  return `<span class="badge ${cls}"${style}>${esc(m.k)}</span>`;
}
function card(title, sub) {
  const c = el('section', 'card');
  if (title) c.innerHTML = `<h2>${esc(title)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</h2>`;
  return c;
}
function meter(n, total) {
  const pct = Math.round(n / total * 100);
  return `<div class="meter"><div class="t"><div class="f" style="width:${pct}%"></div></div><div class="n">${n}/${total}</div></div>`;
}

/* ============================================================
   작업 이력 (Audit Activity Log) 관리
   ============================================================ */
const LOG_KEY = APP_STORAGE_KEY + ':activityLogs';
let sheetActivityLogs = [];

function getLocalActivityLogs() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

function setSheetActivityLogs(logs) {
  sheetActivityLogs = (Array.isArray(logs) ? logs : []).map(log => ({
    id: log.requestId || `sheet_${log.time}_${log.target}_${log.type}`,
    time: log.time || '',
    type: log.type || 'SHEET_EDIT',
    target: log.target || '공통',
    detail: log.detail || log.error || '',
    tone: log.success === false ? 'bad' : 'info',
    source: log.source || '시트',
    actor: log.actor || '',
    success: log.success !== false
  }));
  renderActivityLogs();
}

function getActivityLogs() {
  const merged = [...getLocalActivityLogs(), ...sheetActivityLogs];
  const unique = new Map();
  merged.forEach(log => {
    const key = log.id || `${log.time}\u0000${log.type}\u0000${log.target}\u0000${log.detail}`;
    if (!unique.has(key)) unique.set(key, log);
  });
  return [...unique.values()]
    .sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')))
    .slice(0, 100);
}

function addLog(actionType, targetName, detailText, tone = 'info', options) {
  const logs = getLocalActivityLogs();
  const now = new Date();
  const opts = options || {};
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const entry = {
    id: opts.requestId || 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    time: `${dateStr} ${timeStr}`,
    type: actionType,
    target: targetName || '공통',
    detail: detailText || '',
    tone: tone,
    source: opts.source || '웹',
    success: opts.success !== false
  };
  logs.unshift(entry);
  if (logs.length > 100) logs.pop(); // 최근 100건 보관
  try { localStorage.setItem(LOG_KEY, JSON.stringify(logs)); }
  catch { toast('작업 로그를 브라우저에 저장하지 못했습니다.'); }
  renderActivityLogs();
  return entry;
}

function clearActivityLogs() {
  try { localStorage.removeItem(LOG_KEY); } catch {}
  renderActivityLogs();
  toast('이 브라우저의 임시 작업 이력을 비웠습니다. 시트 감사 로그는 유지됩니다.');
}

function renderActivityLogs() {
  const container = $('#activityLogList');
  const countEl = $('#activityLogCount');
  const btnEl = $('#btnActivityLog');
  const logs = getActivityLogs();
  if (btnEl) btnEl.textContent = `📋 작업 로그 (${logs.length})`;
  if (!container) return;
  if (countEl) countEl.textContent = `기록 ${logs.length}건`;
  if (!logs.length) {
    container.innerHTML = '<div class="empty" style="text-align:center;padding:24px 0;">아직 기록된 작업 이력이 없습니다.</div>';
    return;
  }
  container.innerHTML = logs.map(log => {
    const toneClass = log.tone ? ` is-${log.tone}` : '';
    const typeLabels = {
      SYNC: '동기화', ADD: '기업 추가', EDIT: '정보 수정',
      CANCEL: '신청취소', RESTORE: '취소 복원', DOC: '서류 변경',
      COACH_DOC: '코치 서류', EXTEND: '기한 연장', SETTING: '설정 변경'
    };
    const badgeType = typeLabels[log.type] || log.type || '기타';
    return `
      <div class="activity-log-item${toneClass}" style="padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface);font-size:12.5px;display:flex;flex-direction:column;gap:4px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="badge" style="font-size:10.5px;padding:2px 7px;">${esc(badgeType)}</span>
            <strong style="color:var(--ink-1);font-size:13px;">${esc(log.target)}</strong>
          </div>
          <span style="font-size:11px;color:var(--ink-3);font-variant-numeric:tabular-nums;">${esc(log.time)}</span>
        </div>
        <div style="color:var(--ink-2);font-size:12px;word-break:break-all;line-height:1.4;">${esc(log.detail)}</div>
        ${(log.actor || log.source) ? `<div style="color:var(--ink-3);font-size:10.5px;">${esc([log.actor, log.source].filter(Boolean).join(' · '))}</div>` : ''}
      </div>
    `;
  }).join('');
}
