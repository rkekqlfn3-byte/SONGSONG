/* ============================================================
   5. 대시보드
   ============================================================ */
function viewDash() {
  const companies = scopedCompanies();
  const coaches = scopedCoaches();
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
  intro.appendChild(mineToggle());
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
  const COACH_DOCS = [
    { k: 'f8', label: '개인정보 수집 동의 [서식8]' },
    { k: 'f9', label: '정보공유 동의 [서식9]' },
    { k: 'f10', label: '사업 참여 서약 [서식10]' },
    { k: 'bank', label: '통장 사본' },
  ];
  const cf = COACH_DOCS.map(d => [d.label, coaches.filter(c => !filled(c[d.k])).length]);
  const coachCard = card('코치 제출 서류 미비', `코치 ${coaches.length}명 기준 · 누르면 미제출 코치 명단`);
  coachCard.appendChild(barChart(cf, n => `${n}명`, () => false,
    label => {
      const hit = COACH_DOCS.find(d => d.label === label);
      go('coach', { missing: hit ? hit.k : '', q: '' });
    }, coaches.length, '--critical'));

  /* --- 지금 막힌 곳 --- */
  const blockCard = buildBlockCard(active);

  const g1 = el('div', 'grid priority-grid'); g1.append(overCard, soonCard);
  const g2 = el('div', 'grid row-2'); g2.append(ownerCard, coachCard);
  const stack = el('div', 'grid'); stack.append(pipeCard, blockCard, g1, g2);
  wrap.appendChild(stack);
  return wrap;
}

/**
 * 「지금 막힌 곳」 — 진행 중 기업을 «다음에 필요한 서류» 하나로 묶는다.
 * 어느 서류에서 몇 건이 멈춰 있는지, 그 건을 누가 처리해야 하는지 한 자리에서 본다.
 */
function buildBlockCard(active) {
  const groups = new Map();
  let allDone = 0;
  active.forEach(c => {
    const def = nextDocDef(c);
    if (!def) { allDone++; return; }
    if (!groups.has(def.k)) groups.set(def.k, { def, list: [] });
    groups.get(def.k).list.push(c);
  });
  const rows = [...groups.values()].sort((a, b) => b.list.length - a.list.length);
  const box = card('지금 막힌 곳', `진행 중 ${active.length}건 · 다음 한 칸 기준`);
  box.classList.add('block-card');

  if (!rows.length) {
    box.appendChild(el('div', 'empty', '진행 중인 기업의 서류가 모두 채워져 있습니다.'));
    return box;
  }

  const list = el('div', 'block-list');
  rows.forEach(({ def, list: items }) => {
    const row = el('div', 'block-row');
    const head = el('button', 'block-head');
    head.type = 'button';
    head.setAttribute('aria-expanded', 'false');
    const pct = Math.round(items.length / active.length * 100);
    head.innerHTML =
      `<span class="block-stage">${esc(def.stage)}</span>` +
      `<span class="block-name">${esc(def.label)}</span>` +
      `<span class="block-bar"><i style="width:${pct}%"></i></span>` +
      `<strong class="block-count">${items.length}건</strong>` +
      `<span class="block-caret" aria-hidden="true">▾</span>`;

    const body = el('div', 'block-body');
    body.hidden = true;
    // 처리할 사람별로 묶어 보여준다 — 전화 한 통에 여러 건이 붙는다
    const byActor = new Map();
    items.forEach(c => {
      const who = docActorOf(c, def);
      if (!byActor.has(who)) byActor.set(who, []);
      byActor.get(who).push(c);
    });
    [...byActor.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([who, cs]) => {
      const grp = el('div', 'block-actor');
      grp.innerHTML = `<div class="block-actor-name">${def.byCoach ? '코치' : '담당'} ${esc(who)} <span class="dim">${cs.length}건</span></div>`;
      const chips = el('div', 'block-chips');
      cs.sort((a, b) => (a.dday ?? 9999) - (b.dday ?? 9999)).forEach(c => {
        const b = el('button', 'block-chip' + (c.dday != null && c.dday < 0 ? ' is-over' : c.dday != null && c.dday <= 14 ? ' is-soon' : ''));
        b.type = 'button';
        b.innerHTML = `${esc(c.name)}${c.dday != null ? `<em>D${c.dday < 0 ? '+' + -c.dday : '-' + c.dday}</em>` : ''}`;
        b.onclick = () => openCompany(c);
        chips.appendChild(b);
      });
      grp.appendChild(chips);
      body.appendChild(grp);
    });

    const jump = el('button', 'block-jump', '이 서류로 기업 목록 보기 →');
    jump.type = 'button';
    jump.onclick = () => go('comp', { block: def.k, status: ACTIVE_STATUS_FILTER, q: '', owner: '', coach: '', initial: '' });
    body.appendChild(jump);

    head.onclick = () => {
      const open = body.hidden;
      body.hidden = !open;
      head.setAttribute('aria-expanded', String(open));
      row.classList.toggle('is-open', open);
    };
    row.append(head, body);
    list.appendChild(row);
  });
  box.appendChild(list);
  if (allDone) {
    const note = el('div', 'count-note');
    note.textContent = `서류 15종이 모두 채워진 진행 중 기업 ${allDone}건은 여기에 표시되지 않습니다.`;
    box.appendChild(note);
  }
  return box;
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
    c.coachName, c.owner, c.status, c.memo,
  ];

function filteredCompanies() {
  const s = state.comp;
  return scopedCompanies().filter(c => {
    // 「막힌 서류」 — 이 기업의 다음 한 칸이 고른 서류인 건만
    if (s.block) { const n = nextDocDef(c); if (!n || n.k !== s.block) return false; }
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

/**
 * 기업 목록과 상세 패널에서 공통으로 쓰는 메모 전용 편집기.
 * 메모 한 칸만 저장하므로 시트에서 동시에 고친 다른 기업 정보는 덮어쓰지 않는다.
 */
function openCompanyMemoEditor(company, host, trigger, options) {
  const opts = options || {};
  document.querySelectorAll('.company-memo-editor').forEach(editor => {
    if (typeof editor.cancelEdit === 'function') editor.cancelEdit(false);
    else editor.remove();
  });

  const display = opts.display || null;
  const form = el('form', 'company-memo-editor');
  const box = el('textarea');
  const actions = el('div', 'company-memo-editor-actions');
  const stateText = el('span', 'company-memo-editor-state');
  const cancel = el('button', 'btn', '취소');
  const save = el('button', 'btn primary', '저장');
  box.maxLength = 500;
  box.rows = 3;
  box.value = company.memo || '';
  box.placeholder = '기업 메모를 입력하세요';
  box.setAttribute('aria-label', `${company.name} 메모`);
  stateText.setAttribute('aria-live', 'polite');
  cancel.type = 'button';
  save.type = 'submit';
  actions.append(stateText, cancel, save);
  form.append(box, actions);

  const close = restoreFocus => {
    form.remove();
    trigger.hidden = false;
    if (display) display.hidden = false;
    if (restoreFocus !== false && document.contains(trigger)) trigger.focus();
  };
  form.cancelEdit = close;
  trigger.hidden = true;
  if (display) display.hidden = true;
  host.appendChild(form);

  cancel.onclick = () => close(true);
  form.onclick = event => event.stopPropagation();
  box.onkeydown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      form.requestSubmit();
    }
  };
  box.oninput = () => {
    box.classList.remove('bad');
    stateText.classList.remove('bad');
    stateText.textContent = '';
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const memo = box.value.trim();
    const before = company.memo || '';
    if (memo === before) {
      close(true);
      toast('변경된 메모가 없습니다.');
      return;
    }
    box.disabled = true;
    cancel.disabled = true;
    save.disabled = true;
    save.textContent = '저장 중…';
    stateText.textContent = 'Google Sheet에 반영 중';
    try {
      await requestSheetWrite(writeEndpoint(), 'updateMemo', {
        companyName: company.name,
        memo,
        _audit: {
          type: 'MEMO',
          target: company.name,
          detail: memo ? '기업 메모 수정' : '기업 메모 지움',
          tone: 'info',
          before: { memo: before },
          after: { memo }
        }
      });
      company.memo = memo;
      close(false);
      if (typeof opts.onSaved === 'function') opts.onSaved(memo);
      else render();
      toast(`${company.name} 메모 저장 완료`);
      syncFromSheet(localStorage.getItem(SHEET_ENDPOINT_KEY) || DEFAULT_SHEET_URL, {
        silent: true, reason: 'after-write'
      }).catch(error => console.error(error));
    } catch (error) {
      console.error(error);
      box.disabled = false;
      cancel.disabled = false;
      save.disabled = false;
      save.textContent = '다시 저장';
      stateText.textContent = error.message || '저장하지 못했습니다.';
      stateText.classList.add('bad');
      box.classList.add('bad');
      box.focus();
    }
  };
  requestAnimationFrame(() => {
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  });
}

function viewCompanies() {
  const s = state.comp;
  const all = scopedCompanies();
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
    picker(s.block, DOC_DEFS.filter(d => d.type !== 'auto').map(d => ({ v: d.k, t: d.label })),
      v => { s.block = v; render(); }, '막힌 서류 전체'),
    mineToggle(),
    activeFilters,
  ]);
  bar.appendChild(el('div', 'spacer'));
  const add = el('button', 'btn primary', '＋ 기업 추가');
  add.onclick = openCompanyDialog;
  bar.appendChild(add);
  const exp = el('button', 'btn', 'CSV 내보내기');
  exp.onclick = () => csvDownload('기업목록.csv', [
    ['진행현황', '담당자', '기업명', '메모', '근로자수', '사업장관리번호', '주소', '공단지사', 'HRD4U',
      '기업담당자', '직급', '전화', '이메일',
      '1차 컨설팅일', '1차 시간', '1차 동행', '1차 동행 담당자',
      '2차 컨설팅일', '2차 시간', '2차 동행', '2차 동행 담당자',
      '원 종료기한', '2주연장', '적용 종료기한', 'D-day', '코치', '코치이메일', '서류제출'],
    ...rows.map(c => [c.status, c.owner, c.name, c.memo || '',
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
      `<button type="button" class="row-memo${c.memo ? '' : ' empty'}" data-company-memo="${esc(c.name)}"` +
      ` data-tip="${esc(c.memo || '메모 추가')}">${esc(c.memo || '메모 추가')}</button>` +
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
    { k: 'block', h: '다음 할 일', sort: false, cls: 'nowrap', cell: c => {
        if (!ACTIVE.has(c.status)) return '<span class="dim">—</span>';
        const d = nextDocDef(c);
        if (!d) return '<span class="dim">서류 완료</span>';
        return `<span class="next-doc"><b>${esc(d.label)}</b><em>${esc(docActorOf(c, d))}</em></span>`;
      } },
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
    built.querySelectorAll('[data-company-memo]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const company = state.M.companies.find(c => c.name === btn.dataset.companyMemo);
        if (company) openCompanyMemoEditor(company, btn.closest('td'), btn);
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
    if (s.block) { const d = byDocKey(s.block); labels.push(`「${d ? d.label : s.block}」에서 막힘`); }
    if (!s.q && s.initial) labels.push(`${s.initial} 기업`);
    paintActiveFilters(activeFilters, labels, () => {
      Object.assign(s, { q: '', status: '', owner: '', coach: '', initial: '', block: '' });
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
   7-2. 일정 탭

   1차·2차를 «한 기업의 두 값»이 아니라 «각각 독립된 일정 한 건»으로 펼친다.
   같은 기업이라도 회차마다 시간과 동행 담당자가 다르고, 동행이 2차에만
   붙는 경우도 있어서 회차를 하나로 합치면 틀린 날짜를 보게 된다.
   ============================================================ */

/** 일정 줄에서 검색이 걸리는 값 — 기업·내부 담당자·코치·동행 담당자·기업 담당자·진행현황 */
const SCHED_SEARCH_FIELDS = e => [
  e.c.name, e.c.owner, e.c.coachName, e.owner,
  e.c.contact && e.c.contact.name, e.c.status,
];

/** 기업 목록을 «일정 한 건» 단위로 펼친다. 날짜가 아직 없는 회차는 빠진다 */
function scheduleEntries(companies) {
  const out = [];
  companies.forEach(c => {
    (c.consultations || []).forEach((k, i) => {
      if (!k.date && !filled(k.dateRaw)) return;
      out.push({
        c, round: i + 1,
        date: k.date, dateRaw: k.dateRaw,
        time: k.time, visit: k.visit, owner: k.owner,
        logKey: i ? 'log2' : 'log1',
      });
    });
  });
  // 날짜를 못 읽은 자유 입력('8월초' 등)은 맨 뒤로 보낸다
  return out.sort((a, b) => {
    const av = a.date ? a.date.getTime() : Infinity;
    const bv = b.date ? b.date.getTime() : Infinity;
    if (av !== bv) return av - bv;
    return (a.time || '').localeCompare(b.time || '') || a.c.name.localeCompare(b.c.name);
  });
}

function viewSchedule() {
  const s = state.sched;
  const companies = scopedCompanies();
  const all = scheduleEntries(companies);
  const activeFilters = el('div', 'active-filter-badge');

  const isPast = e => e.date && e.date < TODAY;
  // 검색어는 매 글자마다 화면 전체를 다시 그리면 한글 조합이 끊기므로 목록만 갈아끼운다
  const currentRows = () => {
    const r = all.filter(e => {
      if (s.when === 'up' && isPast(e)) return false;
      if (s.when === 'past' && !isPast(e)) return false;
      if (s.visitOnly && !e.visit) return false;
      if (s.owner && (e.c.owner || '') !== s.owner) return false;
      return matchesQuery(s.q, SCHED_SEARCH_FIELDS(e));
    });
    if (s.when === 'past') r.reverse();            // 지난 일정은 최근 것부터
    return r;
  };

  const refreshFilterBadge = () => {
    const labels = [];
    if (s.q) labels.push(`검색 “${s.q}”`);
    if (s.visitOnly) labels.push('동행하는 일정만');
    if (s.owner) labels.push(`담당 ${s.owner}`);
    paintActiveFilters(activeFilters, labels, () => {
      Object.assign(s, { q: '', visitOnly: false, owner: '' });
      render();
    });
  };

  const bar = toolbar([
    search(s.q, '기업 · 담당자 · 코치 검색 (초성 가능)', v => { s.q = v; refreshList(); }),
    picker(s.when, [{ v: 'up', t: '다가오는 일정' }, { v: 'past', t: '지난 일정' }],
      v => { s.when = v; render(); }, '전체 기간'),
    picker(s.owner, uniq(companies.map(c => c.owner)).map(v => ({ v, t: v })),
      v => { s.owner = v; render(); }, '담당자 전체'),
    (() => {
      const l = el('label', 'inline');
      l.innerHTML = `<input type="checkbox"${s.visitOnly ? ' checked' : ''}> 동행하는 일정만`;
      l.querySelector('input').onchange = e => { s.visitOnly = e.target.checked; render(); };
      return l;
    })(),
    mineToggle(),
    activeFilters,
  ]);
  bar.appendChild(el('div', 'spacer'));
  const exp = el('button', 'btn', 'CSV 내보내기');
  exp.onclick = () => csvDownload('컨설팅일정.csv', [
    ['날짜', '시간', '기업', '회차', '동행', '동행 담당자', '내부 담당자', '코치', '수행일지', '진행현황'],
    ...currentRows().map(e => [
      e.date ? iso(e.date) : (e.dateRaw || ''), e.time || '', e.c.name, `${e.round}차`,
      e.visit ? 'O' : '', e.visit ? (e.owner || '') : '', e.c.owner, e.c.coachName,
      filled(e.c.docs[e.logKey]) ? '제출' : '미제출', e.c.status,
    ]),
  ]);
  bar.appendChild(exp);

  const listHost = el('div');
  const countNote = el('div', 'count-note');
  const box = el('div');
  box.append(bar, listHost, countNote);

  /* --- 날짜별 묶음 --- */
  function buildList(rows) {
    if (!rows.length) {
      const empty = el('div', 'sched-empty');
      empty.innerHTML = s.q || s.visitOnly || s.owner
        ? '<b>검색 결과가 없습니다.</b>'
        : s.when === 'up'
          ? '<b>앞으로 잡힌 일정이 없습니다.</b><p>기업 상세창의 서류 칸에서 컨설팅 날짜와 시간을 적으면 여기에 쌓입니다.</p>'
          : '<b>해당하는 일정이 없습니다.</b>';
      return empty;
    }
    const groups = [];
    rows.forEach(e => {
      const key = e.date ? iso(e.date) : '(날짜 미확정)';
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(e);
      else groups.push({ key, date: e.date, items: [e] });
    });

    const list = el('div', 'sched-list');
    groups.forEach(g => {
      const day = el('section', 'sched-day');
      const dd = g.date ? Math.round((g.date - TODAY) / 864e5) : null;
      const tone = dd == null ? '' : dd < 0 ? ' is-past' : dd === 0 ? ' is-today' : dd <= 7 ? ' is-soon' : '';
      day.className = 'sched-day' + tone;
      day.innerHTML = `<div class="sched-date">
        <span class="sched-date-main">${g.date ? korDate(g.date) : esc(g.items[0].dateRaw || '날짜 미확정')}</span>
        ${dd == null ? '' : `<span class="sched-dday">${dd === 0 ? '오늘' : dd < 0 ? `${-dd}일 전` : `D-${dd}`}</span>`}
        <span class="sched-day-count">${g.items.length}건</span>
      </div>`;

      const items = el('div', 'sched-items');
      g.items.forEach(e => {
        const row = el('button', 'sched-item' + (e.visit ? ' is-visit' : ''));
        row.type = 'button';
        const logDone = filled(e.c.docs[e.logKey]);
        row.innerHTML =
          `<span class="sched-time">${e.time ? esc(e.time) : '<i>시간 미정</i>'}</span>` +
          `<span class="sched-round">${e.round}차</span>` +
          `<span class="sched-company"><b>${esc(e.c.name)}</b>${badge(e.c.status)}</span>` +
          `<span class="sched-people">코치 ${esc(e.c.coachName || '미배정')} · 담당 ${esc(e.c.owner || '미배정')}</span>` +
          (e.visit
            ? `<span class="sched-visit">동행 ${esc(e.owner || '담당자 미정')}</span>`
            : '<span class="sched-visit is-off">동행 없음</span>') +
          `<span class="sched-log${logDone ? ' ok' : ''}">수행일지 ${logDone ? '제출' : '미제출'}</span>`;
        row.onclick = () => openCompany(e.c);
        items.appendChild(row);
      });
      day.appendChild(items);
      list.appendChild(day);
    });
    return list;
  }

  function refreshList() {
    const rows = currentRows();
    listHost.innerHTML = '';
    listHost.appendChild(buildList(rows));
    countNote.textContent = rows.length
      ? `${rows.length}건 표시 / 전체 일정 ${all.length}건 (기업 ${companies.length}곳) · 줄을 누르면 기업 상세가 열립니다`
      : '';
    refreshFilterBadge();
  }
  refreshList();

  /* --- 아직 일정이 없는 진행 중 기업 --- */
  const missing = companies.filter(c => ACTIVE.has(c.status)
    && !c.consultations.some(k => k.date || filled(k.dateRaw)));
  if (missing.length) {
    const mc = card(`일정이 아직 없는 진행 중 기업 ${missing.length}곳`,
      '기업을 누르면 상세창에서 컨설팅 날짜를 적을 수 있습니다');
    mc.classList.add('sched-missing-card');
    const chips = el('div', 'block-chips');
    missing.sort((a, b) => (a.dday ?? 9999) - (b.dday ?? 9999)).forEach(c => {
      const b = el('button', 'block-chip' + (c.dday != null && c.dday < 0 ? ' is-over' : c.dday != null && c.dday <= 14 ? ' is-soon' : ''));
      b.type = 'button';
      b.innerHTML = `${esc(c.name)}${c.dday != null ? `<em>D${c.dday < 0 ? '+' + -c.dday : '-' + c.dday}</em>` : ''}`;
      b.onclick = () => openCompany(c);
      chips.appendChild(b);
    });
    mc.appendChild(chips);
    box.appendChild(mc);
  }
  return box;
}

/* ============================================================
   8. 코치 탭
   ============================================================ */
const COACH_DOC_FILTERS = [
  { v: 'f8', t: '서식8 미제출' },
  { v: 'f9', t: '서식9 미제출' },
  { v: 'f10', t: '서식10 미제출' },
  { v: 'bank', t: '통장 사본 미제출' },
];
function viewCoaches() {
  const s = state.coach;
  const all = scopedCoaches();
  const activeFilters = el('div', 'active-filter-badge');
  const currentRows = () => {
    let list = all.filter(c => matchesQuery(s.q, [c.name, c.owner, c.email, c.phone]));
    if (s.missing) list = list.filter(c => !filled(c[s.missing]));
    return sortBy(list, s.sort, s.dir, { load: c => c.companies.length }).map(c => (c._key = c.name, c));
  };
  const refreshFilterBadge = () => {
    const labels = [];
    if (s.q) labels.push(`검색 “${s.q}”`);
    if (s.missing) labels.push((COACH_DOC_FILTERS.find(f => f.v === s.missing) || {}).t || s.missing);
    paintActiveFilters(activeFilters, labels, () => {
      Object.assign(s, { q: '', missing: '' });
      render();
    });
  };

  const bar = toolbar([
    search(s.q, '코치 · 담당자 · 이메일 검색', v => { s.q = v; refreshList(); }),
    picker(s.missing, COACH_DOC_FILTERS, v => { s.missing = v; render(); }, '제출 서류 전체'),
    (() => {
      const l = el('label', 'inline');
      l.innerHTML = `<input type="checkbox"${s.reveal ? ' checked' : ''}> 생년월일·주소 표시`;
      l.querySelector('input').onchange = e => { s.reveal = e.target.checked; render(); };
      return l;
    })(),
    mineToggle(),
    activeFilters,
  ]);
  refreshFilterBadge();
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
    refreshFilterBadge();
  }
  refreshList();
  return box;
}
