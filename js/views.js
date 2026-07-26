/* ============================================================
   5. 대시보드
   ============================================================ */
function viewDash() {
  const { companies, coaches } = state.M;
  const wrap = el('div');

  const byStatus = k => companies.filter(c => c.status === k);
  const active = companies.filter(c => ACTIVE.has(c.status));
  const completed = byStatus('지급완료');
  const overdue = active.filter(c => c.dday != null && c.dday < 0).sort((a, b) => a.dday - b.dday);
  const soon = active.filter(c => c.dday != null && c.dday >= 0 && c.dday <= 14).sort((a, b) => a.dday - b.dday);
  const noOwner = companies.filter(c => !c.owner);
  const noCoach = companies.filter(c => !c.coachName);

  /* --- 오늘의 운영 브리핑 --- */
  const intro = el('section', 'dash-intro');
  const priorityCount = overdue.length + soon.length;
  intro.innerHTML = `
    <div class="dash-copy">
      <div class="dash-title">
        <div class="eyebrow">OPERATION OVERVIEW</div>
        <h2>오늘의 운영 현황</h2>
      </div>
      <p>${priorityCount
        ? `기한 경과 ${overdue.length}건과 14일 이내 마감 ${soon.length}건을 우선 확인하세요.`
        : '현재 긴급하게 확인할 일정이 없습니다. 전체 진행 흐름을 점검하세요.'}</p>
    </div>`;
  wrap.appendChild(intro);

  /* --- KPI --- */
  const kpis = el('div', 'kpis');
  const K = (lab, val, hint, tone, onClick) => {
    const d = el('div', 'kpi' + (tone ? ` is-${tone}` : '') + (onClick ? ' clickable' : ''));
    d.innerHTML = `<div class="lab">${esc(lab)}</div><div class="val">${val}</div><div class="hint">${esc(hint)}</div>`;
    if (onClick) {
      d.onclick = onClick;
      d.tabIndex = 0;
      d.setAttribute('role', 'button');
      d.setAttribute('aria-label', `${lab} ${val}. ${hint}`);
      d.onkeydown = e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
      };
    }
    return d;
  };
  kpis.append(
    K('기한 경과', overdue.length, overdue.length ? `최장 ${-overdue[0].dday}일 경과` : '없음', 'critical',
      overdue.length ? () => document.getElementById('overdueCard').scrollIntoView({ behavior: 'smooth', block: 'center' }) : null),
    K('14일 내 마감', soon.length, soon.length ? `가장 급한 건 D-${soon[0].dday}` : '없음', 'warning',
      soon.length ? () => document.getElementById('soonCard').scrollIntoView({ behavior: 'smooth', block: 'center' }) : null),
    K('진행 중', active.length, '검토요청부터 지급준비까지', '',
      () => go('comp', { status: ACTIVE_STATUS_FILTER, q: '', owner: '', coach: '' })),
    K('지급 준비', byStatus('지급준비').length, '지급 전 최종 확인 필요', 'good',
      () => go('comp', { status: '지급준비', q: '', owner: '', coach: '' })),
    K('완료 기업', completed.length, '지급완료 상태 기업', 'complete',
      () => go('comp', { status: '지급완료', q: '', owner: '', coach: '' })),
    K('담당자 미배정', noOwner.length, `코치 미배정 ${noCoach.length}건`, 'muted',
      () => go('comp', { owner: '(미배정)', status: '', q: '' })),
  );
  wrap.appendChild(kpis);

  /* --- 파이프라인 --- */
  const flow = STATUS.filter(s => !s.term && !s.done);
  const flowTotal = flow.reduce((a, s) => a + byStatus(s.k).length, 0) || 1;
  const pipeCard = card('진행 파이프라인', '막대를 누르면 해당 단계의 기업 목록으로 이동합니다');
  pipeCard.classList.add('pipeline-card');
  const pipe = el('div', 'pipe');
  flow.forEach(s => {
    const n = byStatus(s.k).length;
    const pct = Math.round(n / flowTotal * 100);
    const d = el('button', 'pipe-step');
    d.type = 'button';
    d.style.setProperty('--stage-color', `var(${s.v})`);
    d.innerHTML = `<span>${esc(s.k)}</span><strong>${n}</strong><small>${pct}%</small>`;
    d.dataset.tip = `${s.k} ${n}건`;
    d.setAttribute('aria-label', `${s.k} ${n}건, 전체 진행 단계 중 ${pct}%`);
    d.onclick = () => go('comp', { status: s.k, q: '', owner: '', coach: '' });
    pipe.appendChild(d);
  });
  const legend = el('div', 'legend');
  legend.innerHTML = flow.map(s =>
    `<button data-status="${esc(s.k)}"><i class="chip" style="background:var(${s.v})"></i>${esc(s.k)} <b>${byStatus(s.k).length}</b></button>`
  ).join('') + STATUS.filter(s => s.done).map(s =>
    `<button class="done" data-status="${esc(s.k)}"><i class="chip" style="background:var(${s.v})"></i>완료 기업 <b>${byStatus(s.k).length}</b></button>`
  ).join('') + STATUS.filter(s => s.term).map(s =>
    `<button class="term" data-status="${esc(s.k)}"><i class="chip" style="background:var(--axis)"></i>${esc(s.k)} <b>${byStatus(s.k).length}</b></button>`
  ).join('');
  legend.onclick = e => { const b = e.target.closest('button'); if (b) go('comp', { status: b.dataset.status, q: '', owner: '', coach: '' }); };
  pipeCard.append(pipe, legend);

  /* --- 기한 경과 --- */
  const overCard = card(`기한 경과 ${overdue.length}건`, '종료기한이 지났는데 아직 진행 중인 건');
  overCard.id = 'overdueCard';
  overCard.classList.add('priority-card', 'is-over');
  overCard.appendChild(alertList(overdue, 'over'));

  /* --- 마감 임박 --- */
  const soonCard = card(`14일 내 마감 ${soon.length}건`, '');
  soonCard.id = 'soonCard';
  soonCard.classList.add('priority-card', 'is-soon');
  soonCard.appendChild(alertList(soon, 'soon'));

  /* --- 담당자 부하 --- */
  const owners = {};
  companies.forEach(c => { const k = c.owner || '(미배정)'; owners[k] = (owners[k] || 0) + 1; });
  const ownerRows = Object.entries(owners).sort((a, b) => b[1] - a[1]);
  const ownerCard = card('담당자별 배정 건수', `${companies.length}건 기준`);
  ownerCard.appendChild(barChart(ownerRows, n => `${n}건`, k => k === '(미배정)',
    (k) => go('comp', { owner: k, status: '', q: '', coach: '' })));

  /* --- 코치 서류 미비 --- */
  const cf = [
    ['개인정보 수집 동의 [서식8]', coaches.filter(c => !filled(c.f8)).length],
    ['정보공유 동의 [서식9]', coaches.filter(c => !filled(c.f9)).length],
    ['사업 참여 서약 [서식10]', coaches.filter(c => !filled(c.f10)).length],
    ['통장 사본', coaches.filter(c => !filled(c.bank)).length],
  ];
  const coachCard = card('코치 제출 서류 미비', `코치 ${coaches.length}명 기준 · 미제출 인원`);
  coachCard.appendChild(barChart(cf, n => `${n}명`, () => false, () => go('coach', { q: '' }), coaches.length, '--critical'));

  const g1 = el('div', 'grid priority-grid'); g1.append(overCard, soonCard);
  const g2 = el('div', 'grid row-2'); g2.append(ownerCard, coachCard);
  const stack = el('div', 'grid'); stack.append(pipeCard, g1, g2);
  wrap.appendChild(stack);
  return wrap;
}

function alertList(list, kind) {
  if (!list.length) return el('div', 'empty', '해당하는 건이 없습니다.');
  const box = el('div', 'alerts');
  list.forEach(c => {
    const a = el('button', `alert ${kind}`);
    a.type = 'button';
    const label = c.dday < 0 ? `${-c.dday}일 경과` : `D-${c.dday}`;
    a.innerHTML =
      `<div class="dday">${label}</div>` +
      `<div class="nm">${esc(c.name)}<em>${esc(c.status)}</em></div>` +
      `<div class="who">${esc(c.owner || '담당자 미배정')} · ${esc(c.coachName || '코치 미배정')}</div>`;
    a.dataset.tip = `${c.extended ? '2주 연장 기한' : '종료기한'} ${korDate(c.effectiveEnd)}`;
    a.setAttribute('aria-label', `${c.name}, ${label}, ${c.status}, 담당 ${c.owner || '미배정'}, 코치 ${c.coachName || '미배정'}`);
    a.onclick = () => { state.comp.sel = c.name; go('comp', { q: c.name, status: '', owner: '', coach: '' }); openCompany(c); };
    box.appendChild(a);
  });
  return box;
}

/** 가로 막대 — 단일 계열, 값은 직접 라벨 */
function barChart(rows, fmt, isMuted, onClick, forcedMax, colorVar) {
  const max = forcedMax || Math.max(...rows.map(r => r[1]), 1);
  const box = el('div', 'bars');
  rows.forEach(([k, v]) => {
    const r = el('div', 'bar-row' + (isMuted(k) ? ' muted' : ''));
    r.innerHTML = `<div class="nm" title="${esc(k)}">${esc(k)}</div>` +
      `<div class="bar-track"><div class="bar-fill" style="width:${v / max * 100}%${colorVar ? `;background:var(${colorVar})` : ''}"></div></div>` +
      `<div class="v">${v}</div>`;
    r.dataset.tip = `${k} — ${fmt(v)}`;
    if (onClick) {
      r.style.cursor = 'pointer';
      r.tabIndex = 0;
      r.setAttribute('role', 'button');
      r.setAttribute('aria-label', `${k} ${fmt(v)}`);
      r.onclick = () => onClick(k);
      r.onkeydown = e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(k); }
      };
    }
    box.appendChild(r);
  });
  return box;
}

/* ============================================================
   6. 공용 표 도구
   ============================================================ */
function toolbar(children) {
  const t = el('div', 'toolbar');
  children.filter(Boolean).forEach(c => t.appendChild(c));
  return t;
}
function paintActiveFilters(host, labels, onReset) {
  host.hidden = !labels.length;
  if (!labels.length) { host.innerHTML = ''; return; }
  host.innerHTML = `<span class="filter-count">필터 ${labels.length}</span>` +
    `<span class="filter-label">${esc(labels.join(' · '))}</span><button type="button">초기화</button>`;
  host.querySelector('button').onclick = onReset;
  host.dataset.tip = labels.join('\n');
}
/**
 * 검색창.
 * 화면을 통째로 다시 그리면 한글 조합이 끊겨 마지막 글자가 씹힌다(‘송상현’을 쳐도 스페이스를 눌러야 먹던 문제).
 * 그래서 조합 중에는 표를 다시 그리지 않고 행만 숨기는 liveSearch 쪽으로 넘긴다.
 */
function search(value, ph, on) {
  const i = el('input'); i.type = 'search'; i.value = value; i.placeholder = ph;
  i.dataset.role = 'search';                 // render() 가 포커스를 되살릴 수 있도록 표시
  const push = () => on(i.value);
  i.oninput = push;                           // 조합 중에도 즉시 반응
  i.oncompositionend = push;
  i.onsearch = push;                          // 검색창의 ✕ 버튼
  return i;
}

/* --- 초성 검색 --- */
const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const COMPANY_INITIALS = ['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ','A-Z','#'];
const INITIAL_GROUP = { 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' };
/** '창민테크' → 'ㅊㅁㅌㅋ'. 한글이 아닌 글자는 그대로 둔다 */
function toChosung(text) {
  let out = '';
  for (const ch of String(text || '')) {
    const code = ch.charCodeAt(0) - 0xAC00;
    out += (code >= 0 && code <= 11171) ? CHOSUNG[Math.floor(code / 588)] : ch;
  }
  return out;
}
function companyInitialKey(name) {
  const cleaned = String(name || '').normalize('NFC')
    .replace(/^(?:주식회사|유한회사|\(주\)|\(유\)|㈜)\s*/i, '')
    .replace(/^[^가-힣A-Za-z0-9]+/, '');
  const first = cleaned.charAt(0);
  if (!first) return '#';
  if (/[A-Za-z]/.test(first)) return 'A-Z';
  const code = first.charCodeAt(0) - 0xAC00;
  if (code >= 0 && code <= 11171) {
    const initial = CHOSUNG[Math.floor(code / 588)];
    return INITIAL_GROUP[initial] || initial;
  }
  return '#';
}
/** 부분일치 + 초성일치. 'ㅊㅁ'으로 창민테크가, 띄어쓰기가 달라도 잡힌다 */
function matchesQuery(query, fields) {
  const q = searchKey(query);
  if (!q) return true;
  const chosungOnly = /^[ㄱ-ㅎ\s]+$/.test(q);
  const bare = q.replace(/\s+/g, '');
  return fields.some(v => {
    const text = searchKey(v);
    if (!text) return false;
    if (text.includes(q)) return true;
    if (text.replace(/\s+/g, '').includes(bare)) return true;     // 띄어쓰기 차이 흡수
    return chosungOnly && toChosung(text).replace(/\s+/g, '').includes(bare);
  });
}

/**
 * 표를 다시 그리지 않고 행만 숨기는 즉시 검색.
 * 각 탭이 렌더하면서 자기 방식대로 채우고, render() 가 갈아끼울 때 비운다.
 */
let liveSearch = null;
/** rows 와 items 는 같은 순서. 보이는 항목 배열을 돌려준다 */
function filterRowsInPlace(tbody, items, query, fieldsOf) {
  const rows = [...tbody.children];
  const visible = [];
  rows.forEach((tr, i) => {
    const item = items[i];
    if (!item) return;
    const hit = matchesQuery(query, fieldsOf(item));
    tr.hidden = !hit;
    if (hit) visible.push(item);
  });
  return visible;
}
function picker(value, opts, on, blank) {
  const s = el('select');
  s.innerHTML = `<option value="">${esc(blank)}</option>` +
    opts.map(o => `<option value="${esc(o.v)}"${o.v === value ? ' selected' : ''}>${esc(o.t)}</option>`).join('');
  s.onchange = () => on(s.value);
  return s;
}
const uniq = arr => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
const searchKey = value => String(value || '').normalize('NFC').toLocaleLowerCase('ko-KR').trim();

/** 정렬 가능한 표 렌더 */
function table(cols, rows, opts) {
  opts = opts || {};
  const wrap = el('div', 'tablewrap' + (opts.cls ? ' ' + opts.cls : ''));
  const t = el('table');
  const thead = el('thead');
  let head = '';
  if (opts.groupRow) head += `<tr>${opts.groupRow}</tr>`;
  head += '<tr>' + cols.map(c => {
    const sortable = c.sort !== false && opts.onSort;
    const active = opts.sortKey === c.k;
    return `<th class="${sortable ? 'sortable ' : ''}${c.cls || ''}" data-k="${esc(c.k)}"` +
      (sortable ? ` role="button" tabindex="0" aria-sort="${active ? (opts.sortDir > 0 ? 'ascending' : 'descending') : 'none'}"` : '') +
      `>${c.h}` +
      (active ? `<span class="arrow"> ${opts.sortDir > 0 ? '▲' : '▼'}</span>` : '') + '</th>';
  }).join('') + '</tr>';
  thead.innerHTML = head;
  if (opts.onSort) {
    thead.onclick = e => {
      const th = e.target.closest('th.sortable'); if (th) opts.onSort(th.dataset.k);
    };
    thead.onkeydown = e => {
      const th = e.target.closest('th.sortable');
      if (th && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); opts.onSort(th.dataset.k); }
    };
  }
  const tbody = el('tbody');
  const columnLabel = c => {
    const holder = document.createElement('span');
    holder.innerHTML = String(c.h || '').replace(/<br\s*\/?>/gi, ' ');
    return (holder.textContent || '').replace(/\s+/g, ' ').trim();
  };
  rows.forEach(r => {
    const tr = el('tr', (opts.onPick ? 'pick' : '') + (opts.selKey && opts.selKey === r._key ? ' sel' : ''));
    tr.innerHTML = cols.map(c =>
      `<td class="${c.cls || ''}" data-label="${esc(columnLabel(c))}">${c.cell(r)}</td>`).join('');
    if (opts.onPick) {
      tr.onclick = e => {
        if (e.target.closest('button,a,input,select,textarea,label')) return;
        opts.onPick(r);
      };
      tr.tabIndex = 0;
      tr.setAttribute('aria-label', opts.rowLabel ? opts.rowLabel(r) : '행 상세 보기');
      tr.onkeydown = e => {
        if (e.target === tr && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          opts.onPick(r);
        }
      };
    }
    tbody.appendChild(tr);
  });
  t.append(thead, tbody);
  wrap.appendChild(t);
  if (!rows.length) wrap.appendChild(el('div', 'empty', '조건에 맞는 항목이 없습니다.'));
  return wrap;
}
function sortBy(list, key, dir, getters) {
  const g = getters[key] || (r => r[key]);
  return [...list].sort((a, b) => {
    const x = g(a), y = g(b);
    const xe = x == null || x === '', ye = y == null || y === '';
    if (xe && ye) return 0;
    if (xe) return 1;                                  // 빈 값은 항상 뒤로
    if (ye) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
    return String(x).localeCompare(String(y), 'ko') * dir;
  });
}
function csvDownload(name, rows) {
  const body = rows.map(r => r.map(v => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
  const a = el('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`${name} 저장됨`);
}

/* ============================================================
   7. 기업 탭
   ============================================================ */
const COMP_SEARCH_FIELDS = c =>
  [
    c.name, c.contact.name, c.contact.email, c.contact.phone,
    ...Object.values(c.workplace || {}),
    c.coachName, c.owner, c.status,
  ];

function filteredCompanies() {
  const s = state.comp;
  return state.M.companies.filter(c => {
    if (s.status === ACTIVE_STATUS_FILTER) {
      if (!ACTIVE.has(c.status)) return false;
    } else if (s.status && c.status !== s.status) {
      return false;
    }
    if (s.owner) { if (s.owner === '(미배정)' ? c.owner : c.owner !== s.owner) return false; }
    if (s.coach && c.coachName !== s.coach) return false;
    if (!s.q && s.initial && companyInitialKey(c.name) !== s.initial) return false;
    return matchesQuery(s.q, COMP_SEARCH_FIELDS(c));
  });
}
const COMP_SORT = {
  end: c => c.effectiveEnd ? c.effectiveEnd.getTime() : null,
  start: c => c.start ? c.start.getTime() : null,
  docs: c => c.docCount,
  status: c => STATUS.findIndex(x => x.k === c.status),
};
function viewCompanies() {
  const s = state.comp;
  const all = state.M.companies;
  const currentRows = () => sortBy(filteredCompanies(), s.sort, s.dir, COMP_SORT).map(c => (c._key = c.name, c));
  const rows = currentRows();
  const activeFilters = el('div', 'active-filter-badge');

  const bar = toolbar([
    search(s.q, '기업 · 담당자 · 코치 · 연락처 검색', v => {
      s.q = v;
      if (v) s.initial = '';
      refreshList();
    }),
    picker(s.status, [{ v: ACTIVE_STATUS_FILTER, t: '진행 중 전체' }].concat(STATUS.map(x => ({ v: x.k, t: x.k }))),
      v => { s.status = v; render(); }, '진행현황 전체'),
    picker(s.owner, [{ v: '(미배정)', t: '(미배정)' }].concat(uniq(all.map(c => c.owner)).map(v => ({ v, t: v }))),
      v => { s.owner = v; render(); }, '담당자 전체'),
    picker(s.coach, uniq(all.map(c => c.coachName)).map(v => ({ v, t: v })), v => { s.coach = v; render(); }, '코치 전체'),
    activeFilters,
  ]);
  bar.appendChild(el('div', 'spacer'));
  const add = el('button', 'btn primary', '＋ 기업 추가');
  add.onclick = openCompanyDialog;
  bar.appendChild(add);
  const exp = el('button', 'btn', 'CSV 내보내기');
  exp.onclick = () => csvDownload('기업목록.csv', [
    ['진행현황', '담당자', '기업명', '근로자수', '사업장관리번호', '주소', '공단지사', 'HRD4U',
      '기업담당자', '직급', '전화', '이메일',
      '1차 컨설팅일', '1차 시간', '1차 동행', '1차 동행 담당자',
      '2차 컨설팅일', '2차 시간', '2차 동행', '2차 동행 담당자',
      '원 종료기한', '2주연장', '적용 종료기한', 'D-day', '코치', '코치이메일', '서류제출'],
    ...rows.map(c => [c.status, c.owner, c.name,
      (c.workplace || {}).employeeCount, (c.workplace || {}).managementNumber,
      (c.workplace || {}).address, (c.workplace || {}).agencyBranch, (c.workplace || {}).hrd4uId,
      c.contact.name, c.contact.title, c.contact.phone, c.contact.email,
      c.consultations[0].date ? iso(c.consultations[0].date) : (c.consultations[0].dateRaw || (c.start ? iso(c.start) : c.startRaw)),
      c.consultations[0].time, c.consultations[0].visit ? 'O' : '', c.consultations[0].owner,
      c.consultations[1].date ? iso(c.consultations[1].date) : c.consultations[1].dateRaw,
      c.consultations[1].time, c.consultations[1].visit ? 'O' : '', c.consultations[1].owner,
      c.end ? iso(c.end) : c.endRaw, c.extended ? 'O' : '',
      c.effectiveEnd ? iso(c.effectiveEnd) : c.endRaw, c.dday ?? '', c.coachName, c.coachEmail, `${c.docCount}/${DOC_DEFS.length}`]),
  ]);
  bar.appendChild(exp);

  const cols = [
    { k: 'status', h: '진행현황', cell: c => badge(c.status) },
    { k: 'name', h: '기업명', cls: 'company-name', cell: c =>
      `<div class="company-name-wrap"><span class="strong">${esc(c.name)}</span>` +
      `<button type="button" class="row-edit-company" data-company-edit="${esc(c.name)}" aria-label="${esc(c.name)} 정보 수정">수정</button>` +
      (c.status === '신청취소' ? '' :
        `<button type="button" class="row-edit-company row-cancel-company" data-company-cancel="${esc(c.name)}" aria-label="${esc(c.name)} 신청취소 처리">취소</button>`) +
      `</div>` },
    { k: 'owner', h: '담당자', cls: 'nowrap', cell: c => c.owner ? esc(c.owner) : '<span class="dim">미배정</span>' },
    { k: 'contact', h: '기업 담당자', cls: 'nowrap', cell: c => c.contact.name ? `${esc(c.contact.name)} <span class="dim">${esc(c.contact.title)}</span>` : '<span class="dim">—</span>' },
    { k: 'phone', h: '연락처', sort: false, cls: 'dt', cell: c => esc(c.contact.phone.split('\n')[0] || '—') },
    { k: 'coachName', h: '코치', cls: 'nowrap', cell: c => c.coachName ? esc(c.coachName) : '<span class="dim">미배정</span>' },
    { k: 'start', h: '컨설팅 일정', cls: 'dt', cell: c => {
        const first = c.consultations[0].date || c.start;
        const firstRaw = c.consultations[0].dateRaw || c.startRaw;
        const second = c.consultations[1].date;
        const secondRaw = c.consultations[1].dateRaw;
        const firstText = first ? md(first) : esc(firstRaw || '—');
        const secondText = second ? md(second) : esc(secondRaw || '—');
        return `${firstText} / ${secondText}`;
      } },
    { k: 'end', h: 'D-day', cls: 'dt num', cell: c => {
        if (c.dday == null) return '<span class="dim">—</span>';
        if (c.dday < 0) return `<span style="color:var(--critical);font-weight:650">${-c.dday}일 경과</span>`;
        if (c.dday <= 14) return `<span style="font-weight:650">D-${c.dday}</span>`;
        return `D-${c.dday}`;
      } },
    { k: 'docs', h: '서류', sort: true, cell: c => meter(c.docCount, DOC_DEFS.length) },
  ];

  const tableOpts = () => ({
    onSort: k => { if (s.sort === k) s.dir *= -1; else { s.sort = k; s.dir = 1; } render(); },
    sortKey: s.sort, sortDir: s.dir, selKey: s.sel, onPick: openCompany,
    rowLabel: c => `${c.name} 기업 상세 보기`,
    cls: 'mobile-cards company-table',
  });
  const note = n => `${n}건 표시 / 전체 ${all.length}건 · 행을 누르면 상세가 열립니다`;
  const makeCompanyTable = r => {
    const built = table(cols, r, tableOpts());
    built.querySelectorAll('[data-company-edit]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const company = state.M.companies.find(c => c.name === btn.dataset.companyEdit);
        if (company) openCompanyEditDialog(company);
      };
    });
    built.querySelectorAll('[data-company-cancel]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();                     // 행 클릭(상세 열기)과 겹치지 않게
        const company = state.M.companies.find(c => c.name === btn.dataset.companyCancel);
        if (company) cancelCompany(company);
      };
    });
    return built;
  };

  const initialIndex = el('div', 'initial-index');
  const usedInitials = new Set(all.map(c => companyInitialKey(c.name)));
  const initialKeys = COMPANY_INITIALS.filter(key => usedInitials.has(key));
  initialIndex.innerHTML = [
    `<button type="button" data-initial="" aria-pressed="${!s.initial}">전체</button>`,
    ...initialKeys.map(key =>
      `<button type="button" data-initial="${key}" aria-pressed="${s.initial === key}" aria-label="${key} 기업만 보기">${key}</button>`),
  ].join('');
  initialIndex.onclick = event => {
    const button = event.target.closest('[data-initial]');
    if (!button) return;
    s.initial = button.dataset.initial;
    s.q = '';
    render();
  };

  const listHost = el('div');
  listHost.appendChild(makeCompanyTable(rows));
  const box = el('div');
  box.append(bar, initialIndex, listHost, el('div', 'count-note', note(rows.length)));

  function refreshFilterBadge() {
    const labels = [];
    if (s.q) labels.push(`검색 “${s.q}”`);
    if (s.status) labels.push(s.status === ACTIVE_STATUS_FILTER ? '진행 중 전체' : s.status);
    if (s.owner) labels.push(`담당 ${s.owner}`);
    if (s.coach) labels.push(`코치 ${s.coach}`);
    if (!s.q && s.initial) labels.push(`${s.initial} 기업`);
    paintActiveFilters(activeFilters, labels, () => {
      Object.assign(s, { q: '', status: '', owner: '', coach: '', initial: '' });
      render();
    });
  }

  // 검색어는 매 타이핑마다 전체 render() 를 하면 입력 포커스를 잃으므로 표만 갈아끼운다
  function refreshList() {
    const r = currentRows();
    listHost.innerHTML = '';
    listHost.appendChild(makeCompanyTable(r));
    box.lastChild.textContent = note(r.length);
    refreshFilterBadge();
  }
  refreshFilterBadge();
  return box;
}

/* ============================================================
   8. 코치 탭
   ============================================================ */
function viewCoaches() {
  const s = state.coach;
  const all = state.M.coaches;
  const currentRows = () => {
    const list = all.filter(c => matchesQuery(s.q, [c.name, c.owner, c.email, c.phone]));
    return sortBy(list, s.sort, s.dir, { load: c => c.companies.length }).map(c => (c._key = c.name, c));
  };

  const bar = toolbar([
    search(s.q, '코치 · 담당자 · 이메일 검색', v => { s.q = v; refreshList(); }),
    (() => {
      const l = el('label', 'inline');
      l.innerHTML = `<input type="checkbox"${s.reveal ? ' checked' : ''}> 생년월일·주소 표시`;
      l.querySelector('input').onchange = e => { s.reveal = e.target.checked; render(); };
      return l;
    })(),
  ]);
  bar.appendChild(el('div', 'spacer'));
  const exp = el('button', 'btn', 'CSV 내보내기');
  exp.onclick = () => csvDownload('코치목록.csv', [
    ['코치', '내부 담당자', '연락처', '이메일', '담당 기업 수', '서식8', '서식9', '서식10', '통장사본'],
    ...currentRows().map(c => [c.name, c.owner, c.phone, c.email, c.companies.length, cellText(c.f8), cellText(c.f9), cellText(c.f10), c.bank]),
  ]);
  bar.appendChild(exp);

  const yn = v => filled(v)
    ? `<span style="color:var(--good)">✓ <span class="dim">${esc(cellText(v))}</span></span>`
    : `<span style="color:var(--critical);font-weight:650">미제출</span>`;

  const cols = [
    { k: 'name', h: '코치', cell: c => `<span class="strong">${esc(c.name)}</span>` },
    { k: 'owner', h: '내부 담당자', cls: 'nowrap', cell: c => esc(c.owner || '—') },
    { k: 'phone', h: '연락처', cls: 'dt', cell: c => esc(c.phone || '—') },
    { k: 'email', h: '이메일', cell: c => esc(c.email || '—') },
    { k: 'load', h: '담당 기업', cls: 'num', cell: c => c.companies.length ? `${c.companies.length}` : '<span class="dim">0</span>' },
    { k: 'f8', h: '서식8 개인정보', sort: false, cls: 'nowrap', cell: c => yn(c.f8) },
    { k: 'f9', h: '서식9 정보공유', sort: false, cls: 'nowrap', cell: c => yn(c.f9) },
    { k: 'f10', h: '서식10 참여서약', sort: false, cls: 'nowrap', cell: c => yn(c.f10) },
    { k: 'bank', h: '통장사본', sort: false, cls: 'nowrap', cell: c => yn(c.bank) },
  ];
  if (s.reveal) cols.push(
    { k: 'birth', h: '생년월일', cls: 'dt', cell: c => esc(c.birth || '—') },
    { k: 'address', h: '주소', sort: false, cell: c => `<span class="dim">${esc(c.address || '—')}</span>` });

  const tableOpts = () => ({
    onSort: k => { if (s.sort === k) s.dir *= -1; else { s.sort = k; s.dir = 1; } render(); },
    sortKey: s.sort, sortDir: s.dir, selKey: s.sel, onPick: openCoach,
    rowLabel: c => `${c.name} 코치 상세 보기`,
    cls: 'mobile-cards coach-table',
  });
  const listHost = el('div');
  const countNote = el('div', 'count-note');
  const box = el('div');
  box.append(bar, listHost, countNote);

  function refreshList() {
    const rows = currentRows();
    listHost.innerHTML = '';
    listHost.appendChild(table(cols, rows, tableOpts()));
    countNote.textContent = `${rows.length}명 표시 / 전체 ${all.length}명`;
  }
  refreshList();
  return box;
}
