/* ============================================================
   9. 서류 현황 매트릭스
   ============================================================ */
const DOC_SEARCH_FIELDS = c => [c.name, c.coachName, c.owner, c.status];

function companyStageProgressInner(company) {
  const segments = STAGES.map(stage => {
    const defs = DOC_DEFS.filter(def => def.stage === stage);
    const done = defs.filter(def => filled(company.docs[def.k])).length;
    const pct = defs.length ? Math.round(done / defs.length * 100) : 0;
    return `<span class="row-stage-segment" data-tip="${stage} ${done}/${defs.length}">` +
      `<i style="width:${pct}%"></i></span>`;
  }).join('');
  return `<div class="matrix-company-line"><span class="strong" data-tip="${esc(company.name)}">${esc(company.name)}</span>` +
    `<span class="row-doc-total">${company.docCount}/${DOC_DEFS.length}</span></div>` +
    `<div class="row-stage-progress" aria-label="신청·확정·실시·지급 단계별 서류 진행률">${segments}</div>`;
}
function companyStageProgressHtml(company) {
  return `<div class="matrix-company-cell" data-stage-company="${esc(company.name)}">${companyStageProgressInner(company)}</div>`;
}
function docsMobileCardInner(company, defs) {
  const done = defs.filter(def => filled(company.docs[def.k])).length;
  const missing = defs.filter(def => !filled(company.docs[def.k])).map(def => def.short.replace(/\n/g, ' '));
  const missingText = missing.length
    ? `미제출 ${missing.length}종 · ${missing.slice(0, 3).map(esc).join(' · ')}${missing.length > 3 ? ' 외' : ''}`
    : '선택한 단계의 서류가 모두 제출됐습니다.';
  return `<div class="docs-mobile-head">${badge(company.status)}<strong>${esc(company.name)}</strong>` +
    `<span>${done}/${defs.length}</span></div>` +
    `<div class="docs-mobile-progress">${companyStageProgressInner(company)}</div>` +
    `<div class="docs-mobile-meta"><span>담당 ${esc(company.owner || '미배정')}</span>` +
    `<span>코치 ${esc(company.coachName || '미배정')}</span></div>` +
    `<div class="docs-mobile-missing">${missingText}</div>`;
}

function paintDocsMobileCard(card, company, defs) {
  card.innerHTML = docsMobileCardInner(company, defs) +
    `<div class="docs-mobile-actions">` +
    `<button type="button" data-mobile-doc-open>상세 보기</button>` +
    `<button type="button" class="primary" data-mobile-doc-edit>서류 수정</button>` +
    `</div>`;
  $('[data-mobile-doc-open]', card).onclick = () => openCompany(company);
  $('[data-mobile-doc-edit]', card).onclick = () => openCompany(company, true);
}

function viewDocs() {
  const s = state.docs;
  const defs = DOC_DEFS.filter(d => !s.stage || d.stage === s.stage);
  let list = state.M.companies.filter(c => matchesQuery(s.q, DOC_SEARCH_FIELDS(c)));
  if (s.missingOnly) list = list.filter(c => defs.some(d => !filled(c.docs[d.k])));
  const activeFilters = el('div', 'active-filter-badge');
  const refreshFilterBadge = () => {
    const labels = [];
    if (s.q) labels.push(`검색 “${s.q}”`);
    if (s.stage) labels.push(`${s.stage}단계`);
    if (s.missingOnly) labels.push('미제출 기업');
    paintActiveFilters(activeFilters, labels, () => {
      Object.assign(s, { q: '', stage: '', missingOnly: false });
      render();
    });
  };

  const bar = toolbar([
    search(s.q, '기업 · 코치 · 담당자 검색 (초성 가능)', v => {
      s.q = v;
      if (liveSearch) liveSearch(v); else render();
      refreshFilterBadge();
    }),
    picker(s.stage, STAGES.map(v => ({ v, t: `${v}단계` })), v => { s.stage = v; render(); }, '전체 단계'),
    (() => {
      const l = el('label', 'inline');
      l.innerHTML = `<input type="checkbox"${s.missingOnly ? ' checked' : ''}> 미제출 있는 기업만`;
      l.querySelector('input').onchange = e => { s.missingOnly = e.target.checked; render(); };
      return l;
    })(),
    activeFilters,
  ]);
  refreshFilterBadge();
  bar.appendChild(el('div', 'spacer'));
  const exp = el('button', 'btn', 'CSV 내보내기');
  exp.onclick = () => csvDownload('서류현황.csv', [
    ['진행현황', '담당자', '기업', '코치', ...defs.map(d => d.label)],
    ...list.map(c => [c.status, c.owner, c.name, c.coachName, ...defs.map(d => cellText(c.docs[d.k]))]),
  ]);
  bar.appendChild(exp);

  const stageShortcuts = el('nav', 'docs-stage-shortcuts');
  stageShortcuts.setAttribute('aria-label', '서류 단계 빠른 선택');
  [{ value: '', label: '전체' }, ...STAGES.map(stage => ({ value: stage, label: stage }))].forEach(item => {
    const count = item.value ? DOC_DEFS.filter(def => def.stage === item.value).length : DOC_DEFS.length;
    const button = el('button', '', `${item.label} ${count}`);
    button.type = 'button';
    button.setAttribute('aria-pressed', s.stage === item.value ? 'true' : 'false');
    button.onclick = () => {
      if (s.stage === item.value) return;
      s.stage = item.value;
      render();
    };
    stageShortcuts.appendChild(button);
  });

  // 단계 그룹 헤더
  let groupRow =
    `<th class="stick-col stick-status matrix-status"></th>` +
    `<th class="stick-col stick-company matrix-company"></th>` +
    `<th class="stick-col stick-owner matrix-person"></th>` +
    `<th class="stick-col stick-coach matrix-person"></th>`;
  const shown = STAGES.filter(st => defs.some(d => d.stage === st));
  shown.forEach((st, i) => {
    const n = defs.filter(d => d.stage === st).length;
    groupRow += `<th class="grp grp-1" colspan="${n}">${st}<span>${n}종</span></th>`;
  });

  const cols = [
    { k: 'status', h: '진행현황', cls: 'stick-col stick-status matrix-status', sort: false, cell: c => badge(c.status) },
    { k: 'name', h: '기업', sort: false, cls: 'stick-col stick-company matrix-company company-name', cell: companyStageProgressHtml },
    { k: 'owner', h: '담당', sort: false, cls: 'stick-col stick-owner nowrap matrix-person', cell: c => esc(c.owner || '—') },
    { k: 'coachName', h: '코치', sort: false, cls: 'stick-col stick-coach nowrap matrix-person', cell: c => esc(c.coachName || '—') },
  ];
  defs.forEach((d, i) => {
    const first = i === 0 || defs[i - 1].stage !== d.stage;
    cols.push({
      k: d.k, sort: false,
      h: `<span class="vert-in">${esc(d.short).replace(/\n/g, '<br>')}</span>`,
      cls: 'cell' + (first ? ' grp-1' : ''),
      cell: c => docCellHtml(c, d),
    });
  });
  const tbl = table(cols, list.map(c => (c._key = c.name, c)), { cls: 'matrix', groupRow, onPick: openCompany });
  const mobileList = el('div', 'docs-mobile-list');
  list.forEach(c => {
    const card = el('article', 'docs-mobile-card');
    card.dataset.docCardCompany = c.name;
    card.setAttribute('aria-label', `${c.name} 서류 현황`);
    paintDocsMobileCard(card, c, defs);
    mobileList.appendChild(card);
  });

  // 셀 단위로 다시 그릴 수 있도록 현재 화면 구성을 기억해 둔다 (저장할 때 표 전체를 재구축하지 않으려고)
  docsView = { list, defs, visible: list };
  // 검색은 표를 다시 그리지 않고 행만 숨긴다 — 한글 조합이 끊기지 않는다
  liveSearch = query => {
    docsView.visible = filterRowsInPlace(tbl.querySelector('tbody'), list, query, DOC_SEARCH_FIELDS);
    const visibleNames = new Set(docsView.visible.map(c => c.name));
    mobileList.querySelectorAll('[data-doc-card-company]').forEach(card => {
      card.hidden = !visibleNames.has(card.dataset.docCardCompany);
    });
    refreshDocsSummary();
  };

  // 헤더 세로 라벨 + 셀 상태·조작은 렌더 후 입힌다 (cell() 이 문자열만 반환하므로)
  tbl.querySelectorAll('thead tr:last-child th').forEach((th, i) => {
    if (i < 4) return;
    th.classList.add('vert');
    th.dataset.tip = defs[i - 4].label;
  });
  let firstEditableCell = true;
  tbl.querySelectorAll('tbody tr').forEach((tr, ri) => {
    const c = list[ri];
    [...tr.children].forEach((td, ci) => {
      if (ci < 4) return;
      const d = defs[ci - 4];
      td.dataset.company = c.name;
      td.dataset.docKey = d.k;
      td.classList.toggle('miss', !filled(c.docs[d.k]));
      td.dataset.tip = docCellTip(c, d);
      if (!docEditable(d)) { td.classList.add('locked'); return; }

      td.classList.add('editable');
      td.tabIndex = firstEditableCell ? 0 : -1;
      firstEditableCell = false;
      td.onclick = e => { e.stopPropagation(); setDocRovingFocus(td); openDocCell(td); };
      td.onkeydown = e => {
        if (docEditing) return;                 // 편집 중에는 칸이 아니라 입력칸이 키를 받는다
        const step = DOC_ARROWS[e.key];
        if (step) { e.preventDefault(); focusDocCell(moveDocCell(td, step[0], step[1])); return; }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDocCell(td); }
      };
    });
  });

  const overview = el('div', 'docs-overview');
  overview.innerHTML =
    `<div class="docs-stat"><span>표시 기업</span><strong id="docsShown">${list.length}</strong></div>` +
    `<div class="docs-stat good"><span>제출</span><strong id="docsDone">0</strong></div>` +
    `<div class="docs-stat bad"><span>미제출</span><strong id="docsMiss">0</strong></div>` +
    `<div class="docs-stat"><span>완료율</span><strong id="docsRate">0%</strong></div>` +
    `<div class="docs-edit-hint docs-edit-hint-desktop">셀을 누르면 바로 수정 · <b>Enter</b> 아래칸 · <b>Tab</b> 옆칸 · <b>Esc</b> 취소</div>` +
    `<div class="docs-edit-hint docs-edit-hint-mobile">기업 카드를 누르면 상세 화면에서 서류를 수정할 수 있습니다.</div>`;
  const sum = el('div', 'count-note');
  sum.id = 'docsSummary';

  const box = el('div');
  box.append(bar, overview, stageShortcuts, tbl, mobileList, sum);
  requestAnimationFrame(refreshDocsSummary);   // 통계는 DOM에 붙은 뒤 채운다
  return box;
}

/* ------------------------------------------------------------
   서류 칸 직접 편집

   968칸(88개사 × 11종)을 손으로 채우는 작업이라 세 가지를 지킨다.
   1) 저장할 때 표를 통째로 다시 그리지 않는다 — 바뀐 칸만 고쳐 그린다
   2) 응답을 기다리지 않고 화면에 먼저 반영하고, 실패하면 되돌린다
   3) Enter/Tab/화살표로 손이 마우스로 가지 않게 한다
   ------------------------------------------------------------ */
let docEditing = false;
let docsView = { list: [], defs: [] };
const docSaving = new Set();          // 저장 중인 칸 — 같은 칸에 요청이 겹치지 않게 잠근다
const DOC_ARROWS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };

const findCompany = name => state.M.companies.find(c => c.name === name);

function docCellHtml(company, def) {
  const value = company.docs[def.k];
  if (!filled(value)) return '<span class="doc-cell-missing">—</span>';
  return `<span class="doc-cell-value"><i>✓</i>${def.type === 'mark' ? '' : esc(docCellText(value))}</span>`;
}
function docCellTip(company, def) {
  const shown = filled(company.docs[def.k]) ? docCellText(company.docs[def.k]) : '미제출';
  if (def.type === 'auto') return `${company.name} — ${def.label}\n${shown}\n약정 시작일 +28일로 자동 계산 · 직접 고칠 수 있습니다`;
  return `${company.name} — ${def.label}\n${shown}\n` +
    (def.byCoach ? `코치 ${company.coachName || '미배정'} 공통 · 담당 기업 전체에 반영됩니다\n` : '') +
    `눌러서 ${def.type === 'mark' ? '제출 표시를 켜고 끕니다' : '월/일을 입력합니다'}`;
}

/** 표 전체가 아니라 해당 칸만 다시 그린다 */
function paintDocCell(td, company, def) {
  delete td.dataset.pending;
  td.classList.remove('save-failed');
  td.innerHTML = docCellHtml(company, def);
  td.classList.toggle('miss', !filled(company.docs[def.k]));
  td.dataset.tip = docCellTip(company, def);
}
/** 특정 기업·항목에 해당하는 칸을 화면에서 찾아 갱신 (코치 공통값은 여러 기업에 걸린다) */
function repaintDocCells(companyNames, keys) {
  const names = new Set(companyNames);
  document.querySelectorAll('.matrix td[data-doc-key]').forEach(td => {
    if (!names.has(td.dataset.company) || keys.indexOf(td.dataset.docKey) < 0) return;
    const company = findCompany(td.dataset.company);
    if (company) paintDocCell(td, company, byDocKey(td.dataset.docKey));
  });
  document.querySelectorAll('[data-stage-company]').forEach(host => {
    if (!names.has(host.dataset.stageCompany)) return;
    const company = findCompany(host.dataset.stageCompany);
    if (company) host.innerHTML = companyStageProgressInner(company);
  });
  document.querySelectorAll('[data-doc-card-company]').forEach(card => {
    if (!names.has(card.dataset.docCardCompany)) return;
    const company = findCompany(card.dataset.docCardCompany);
    if (company) paintDocsMobileCard(card, company, docsView.defs);
  });
  refreshDocsSummary();
}
function refreshDocsSummary() {
  const defs = docsView.defs;
  const list = docsView.visible || docsView.list;      // 검색으로 숨긴 행은 통계에서도 뺀다
  if (!defs.length || !document.getElementById('docsDone')) return;
  const total = list.length * defs.length;
  const done = list.reduce((sum, c) => sum + defs.filter(d => filled(c.docs[d.k])).length, 0);
  document.getElementById('docsShown').textContent = list.length;
  document.getElementById('docsDone').textContent = done;
  document.getElementById('docsMiss').textContent = Math.max(0, total - done);
  document.getElementById('docsRate').textContent = (total ? Math.round(done / total * 100) : 0) + '%';
  const box = document.getElementById('docsSummary');
  if (box) {
    if (!list.length) { box.textContent = '검색 결과가 없습니다.'; return; }
    const miss = defs.map(d => ({ d, n: list.filter(c => !filled(c.docs[d.k])).length }))
      .sort((a, b) => b.n - a.n).slice(0, 4);
    box.textContent = `${list.length}개사 × 서류 ${defs.length}종 · 미제출 상위: ` +
      miss.map(x => `${x.d.label} ${x.n}건`).join(' · ');
  }
}

/** 화살표·Tab 이동. 자동 계산 칸은 건너뛴다 */
function moveDocCell(td, dCol, dRow) {
  let cur = td;
  for (let guard = 0; guard < 40; guard++) {
    const tr = cur.parentElement;
    const ci = [...tr.children].indexOf(cur);
    const rows = [...tr.parentElement.children];
    const targetRow = rows[rows.indexOf(tr) + dRow];
    if (!targetRow) return null;
    const target = [...targetRow.children][ci + dCol];
    if (!target || !target.dataset.docKey) return null;
    if (target.classList.contains('locked')) { cur = target; continue; }
    return target;
  }
  return null;
}
function focusDocCell(td) {
  if (!td) return;
  setDocRovingFocus(td);
  td.focus();
  const def = byDocKey(td.dataset.docKey);
  if (def && def.type !== 'mark') openDocCell(td);   // 날짜 칸은 이동하면 바로 입력 상태로
}
function setDocRovingFocus(td) {
  const matrix = td && td.closest('.matrix');
  if (!matrix) return;
  matrix.querySelectorAll('td.editable[tabindex="0"]').forEach(cell => { cell.tabIndex = -1; });
  td.tabIndex = 0;
}
/** td 하나로 기업·항목을 찾아 편집을 연다 */
function openDocCell(td) {
  const company = findCompany(td.dataset.company);
  const def = byDocKey(td.dataset.docKey);
  if (company && def) editDocCell(td, company, def, td.dataset.pending);
}

/** O 표시는 눌러서 바로 토글, 날짜는 칸 안에서 월/일을 받는다 */
function editDocCell(td, company, def, seed) {
  if (docEditing) return;
  if (def.type === 'mark') {
    commitDocCell(td, company, def, filled(company.docs[def.k]) ? '' : 'O');
    return;
  }

  docEditing = true;
  const current = docCellText(company.docs[def.k]);
  td.classList.add('editing');
  td.innerHTML = `<div class="doc-edit-wrap">` +
    `<input class="doc-edit" type="text" inputmode="numeric" placeholder="6/22" value="${esc(seed != null ? seed : current)}">` +
    `<span class="doc-year-hint">${getBaseYear()}년</span></div>`;
  const input = td.querySelector('input');
  input.focus();
  input.select();

  let settled = false;
  const close = () => { docEditing = false; td.classList.remove('editing'); };
  const cancel = () => {
    if (settled) return;
    settled = true; close();
    paintDocCell(td, company, def);
    td.focus();
  };
  const commit = (dCol, dRow) => {
    if (settled) return;
    settled = true;
    const raw = input.value.trim();
    close();
    const unchanged = raw === (seed != null ? seed : current) && seed == null;
    /*
     * 저장을 기다리지 않고 커서를 먼저 옮긴다.
     * 시트 왕복이 1~3초라 기다리면 한 칸마다 손이 멈춘다.
     * 값은 commitDocCell 안에서 이미 화면에 먼저 반영되고, 실패하면 그 칸만 되돌아온다.
     */
    if (unchanged) paintDocCell(td, company, def);
    else commitDocCell(td, company, def, raw).catch(error => console.error(error));
    if (dCol || dRow) focusDocCell(moveDocCell(td, dCol, dRow));
  };

  input.onkeydown = e => {
    // 칸(td)에도 같은 키 처리가 붙어 있어서, 막지 않으면 Enter가 버블링돼 편집기가 다시 열린다
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    else if (e.key === 'Enter') { e.preventDefault(); commit(0, 1); }
    else if (e.key === 'Tab') { e.preventDefault(); commit(e.shiftKey ? -1 : 1, 0); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); commit(0, 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); commit(0, -1); }
  };
  input.onblur = () => commit(0, 0);
}

/** 입력값 → 시트에 보낼 값. 월/일 형식이 아니면 null */
function docSendValue(def, entered, year) {
  if (def.type === 'mark') return entered ? 'O' : '';
  const raw = String(entered || '').trim();
  if (!raw) return '';
  const date = monthDayToDate(raw, year);
  if (!date) return null;
  if (def.type === 'range') return `${iso(date)} ~ ${iso(new Date(year, 11, 31))}`;
  return iso(date);
}
/** 저장 실패한 칸은 입력값을 품고 남는다 — 다시 누르면 그 값부터 이어서 고칠 수 있다 */
function markCellFailed(td, raw, message) {
  if (td) {
    td.dataset.pending = raw;
    td.classList.add('save-failed');
    td.classList.remove('saving');
    td.innerHTML = `<span class="doc-cell-failed">${esc(raw || '지움')}</span>`;
    td.dataset.tip = `저장 실패 — ${message}\n눌러서 다시 시도`;
  }
  toast('저장 실패 — ' + message);
}
/** 연속 입력 중에는 토스트를 묶어서 한 번만 띄운다 */
let savedBatch = { n: 0, timer: null };
function noteSaved() {
  savedBatch.n++;
  clearTimeout(savedBatch.timer);
  savedBatch.timer = setTimeout(() => {
    toast(savedBatch.n === 1 ? '저장됨' : `${savedBatch.n}칸 저장됨`);
    savedBatch.n = 0;
  }, 900);
}

/**
 * 한 칸을 시트에 반영한다.
 * 응답을 기다리지 않고 화면에 먼저 넣고, 실패하면 되돌린 뒤 입력값을 셀에 남긴다.
 */
async function commitDocCell(td, company, def, entered, opts) {
  const year = getBaseYear();
  const sent = docSendValue(def, entered, year);
  if (sent === null) {
    markCellFailed(td, entered, '6/22 처럼 월/일로 적어주세요');
    return false;
  }
  const lock = company.name + '\u0000' + def.k;
  if (docSaving.has(lock)) return false;        // 같은 칸에 요청이 겹치지 않게
  if (def.byCoach) {
    if (!company.coach) {
      markCellFailed(td, entered, '배정된 코치가 없습니다');
      return false;
    }
    return commitCoachDoc(td, company.coach, def, sent, opts);
  }

  const docs = { [def.k]: sent };
  if (def.k === 'teamStart') {                       // 약정 시작일을 고치면 종료일(+28일)도 같이
    const date = isoToDate(sent);
    docs.teamEnd = date ? iso(addDays(date, 28)) : '';
  }
  const keys = Object.keys(docs);
  const rollback = {};
  keys.forEach(k => { rollback[k] = company.docs[k]; });

  keys.forEach(k => { company.docs[k] = localDocValue(k, docs[k]); });   // 낙관적 반영
  company.docCount = DOC_DEFS.filter(d => filled(company.docs[d.k])).length;
  repaintDocCells([company.name], keys);
  if (td) td.classList.add('saving');
  docSaving.add(lock);

  try {
    const beforeText = filled(rollback[def.k]) ? docCellText(rollback[def.k]) : '미제출';
    const afterText = sent ? docCellText(localDocValue(def.k, sent)) : '미제출';
    await requestSheetWrite(writeEndpoint(), 'updateDocs', {
      companyName: company.name,
      docs,
      _audit: {
        type: 'DOC',
        target: company.name,
        detail: `${def.label}: ${beforeText} → ${afterText}`,
        tone: 'info',
        before: { [def.k]: beforeText },
        after: { [def.k]: afterText }
      }
    });
    if (td) td.classList.remove('saving');
    // 수행일지를 고치면 같은 차수의 컨설팅일도 시트에 같이 맞춘다 (반대 방향 연동)
    let scheduleSynced = false;
    if (def.linkConsult && sent) {
      try {
        scheduleSynced = await syncConsultDateFromDoc(company, def.linkConsult, sent);
        if (scheduleSynced) render();
      } catch (error) {
        console.error(error);
        toast(`${def.label}은 저장됐지만 컨설팅일 반영은 실패했습니다 — ${error.message || '저장 연결을 확인하세요'}`);
      }
    }
    const alsoSchedule = scheduleSynced ? ` · ${def.linkConsult}차 컨설팅일도 맞춤` : '';
    /*
     * 되돌리기를 띄우는 기준 — 되돌릴 «잃은 값»이 있을 때만.
     *   O 표시  : 클릭 한 번에 저장되므로 항상
     *   날짜 칸 : 원래 값이 있던 칸을 고치거나 지웠을 때 (빈 칸을 채우는 건 잃는 게 없다)
     * 빈 칸을 연속으로 채우는 작업에서는 조용한 «N칸 저장됨» 쪽으로 흘려보낸다.
     */
    const lostValue = filled(rollback[def.k]);
    if (!(opts && opts.isUndo) && (def.type === 'mark' || lostValue)) {
      const back = docCellText(rollback[def.k]);
      const now = def.type === 'mark' ? (sent ? '제출 표시' : '표시 해제')
        : sent ? docCellText(localDocValue(def.k, sent)) : '지움';
      toastUndo(`${company.name} · ${def.label} ${now}${alsoSchedule}`,
        () => commitDocCell(td, company, def, back, { isUndo: true }));
    } else if (scheduleSynced) {
      toast(`${company.name} · ${def.label} ${docCellText(localDocValue(def.k, sent))} 저장${alsoSchedule}`);
    } else {
      noteSaved();
    }
    return true;
  } catch (e) {
    console.error(e);
    keys.forEach(k => { company.docs[k] = rollback[k]; });
    company.docCount = DOC_DEFS.filter(d => filled(company.docs[d.k])).length;
    repaintDocCells([company.name], keys);
    markCellFailed(td, entered, e.message || '저장 연결을 확인하세요');
    return false;
  } finally {
    docSaving.delete(lock);
  }
}

/** 서식8·9·10·통장사본은 코치 공통값이라 같은 코치의 모든 담당 기업에 함께 반영된다 */
async function commitCoachDoc(td, coach, def, sent, opts) {
  const mine = state.M.companies.filter(c => c.coachName === coach.name);
  const lock = '코치:' + coach.name + ' ' + def.k;
  if (docSaving.has(lock)) return false;

  // 한 칸을 고치면 담당 기업 전부가 함께 바뀐다. 되돌리기가 아닐 때만 묻는다.
  if (mine.length > 1 && !(opts && opts.isUndo)) {
    const what = sent ? (def.type === 'mark' ? '제출 표시' : docCellText(localDocValue(def.k, sent))) : '지움';
    const ok = confirm(
      `${coach.name} 코치의 «${def.label}»을 ${what}(으)로 바꿉니다.\n\n` +
      `이 코치가 담당하는 기업 ${mine.length}곳에 모두 반영됩니다.\n계속할까요?`
    );
    if (!ok) { if (td) repaintDocCells([td.dataset.company], [def.k]); return false; }
  }

  const rollbackCoach = coach[def.byCoach];
  const rollback = new Map(mine.map(c => [c.name, c.docs[def.k]]));
  const local = localDocValue(def.k, sent);

  const apply = (coachValue, per) => {
    coach[def.byCoach] = coachValue;
    mine.forEach(c => {
      c.docs[def.k] = per instanceof Map ? per.get(c.name) : per;
      c.docCount = DOC_DEFS.filter(d => filled(c.docs[d.k])).length;
    });
    repaintDocCells(mine.map(c => c.name), [def.k]);
  };

  apply(local, local);                                // 낙관적 반영
  if (td) td.classList.add('saving');
  docSaving.add(lock);

  try {
    const beforeText = filled(rollbackCoach) ? docCellText(rollbackCoach) : '미제출';
    const afterText = sent ? docCellText(local) : '미제출';
    await requestSheetWrite(writeEndpoint(), 'updateCoachDocs', {
      coachName: coach.name,
      docs: { [def.k]: sent },
      _audit: {
        type: 'COACH_DOC',
        target: coach.name,
        detail: `${def.label}: ${beforeText} → ${afterText} · 담당 ${mine.length}개사 반영`,
        tone: 'warn',
        before: { [def.k]: beforeText },
        after: { [def.k]: afterText, affectedCompanies: mine.length }
      }
    });
    if (td) td.classList.remove('saving');
    toast(`${coach.name} 코치 공통 · ${def.label} — 담당 ${mine.length}곳 반영됨`);
    return true;
  } catch (e) {
    console.error(e);
    apply(rollbackCoach, rollback);
    markCellFailed(td, docCellText(local), e.message || '저장 연결을 확인하세요');
    return false;
  } finally {
    docSaving.delete(lock);
  }
}

/* 상세 패널에서 부르는 창구 — 표가 아니라 패널 안에서 고칠 때는 대상 칸이 없다 */
const saveDocCell = (company, def, entered) => commitDocCell(null, company, def, entered);

/*
 * 상세창에서 한 칸을 저장했을 때 «그 줄만» 다시 그린다.
 * 예전에는 상세창 전체를 다시 그려서, 다른 칸에 적어두고 아직 저장하지 않은 내용이 사라졌다.
 */
function refreshDrawerDocRow(company, def) {
  const row = DRAWER.querySelector(`[data-doc-row="${def.k}"]`);
  if (!row) return;
  const raw = company.docs[def.k];
  const has = filled(raw);
  row.classList.toggle('ok', has);
  row.classList.toggle('no', !has);
  const mark = row.querySelector('.mk');
  if (mark) mark.textContent = has ? '●' : '○';
  const view = row.querySelector('.vl');
  if (view) view.textContent = has ? cellText(raw) : '미제출';
  const input = row.querySelector('[data-doc-input]');
  if (input) { input.value = docCellText(raw); input.classList.remove('bad'); }
  const check = row.querySelector('[data-doc-toggle]');
  if (check) check.checked = has;
  // 약정 시작일을 저장하면 종료일(+28일)도 함께 바뀌므로 그 줄도 같이 맞춘다
  if (def.k === 'teamStart') refreshDrawerDocRow(company, byDocKey('teamEnd'));
  refreshDrawerDocCounts(company);
}
/** 단계별 개수와 «서류 7/15» 표시를 지금 값으로 맞춘다 */
function refreshDrawerDocCounts(company) {
  const total = DRAWER.querySelector('[data-doc-total]');
  if (total) total.textContent = `서류 ${company.docCount}/${DOC_DEFS.length}`;
  STAGES.forEach(stage => {
    const box = DRAWER.querySelector(`[data-stage-count="${stage}"]`);
    if (!box) return;
    const defs = DOC_DEFS.filter(d => d.stage === stage);
    box.textContent = `${defs.filter(d => filled(company.docs[d.k])).length}/${defs.length}`;
  });
}
/** 수행일지를 고쳐 컨설팅일이 같이 바뀌었을 때, 상세창 위쪽 일정 줄도 맞춘다 */
function refreshDrawerConsultLines(company) {
  [1, 2].forEach(index => {
    const box = DRAWER.querySelector(`[data-consult-line="${index}"]`);
    const item = (company.consultations || [])[index - 1];
    if (!box) return;
    const fallback = index === 1 ? company.start : null;
    const date = item && item.date ? korDate(item.date)
      : item && item.dateRaw ? esc(item.dateRaw)
      : fallback ? korDate(fallback)
      : '<span class="dim">미정</span>';
    const time = item && item.time ? ` ${esc(item.time)}` : '';
    const visit = item && item.visit
      ? ` <span class="extension-badge">동행 · ${esc(item.owner || '담당자 미정')}</span>`
      : '';
    box.innerHTML = `${date}${time}${visit}`;
  });
}
/** 코치 상세창에서도 저장한 줄만 다시 그린다 */
function refreshCoachDocRow(coach, def) {
  const row = DRAWER.querySelector(`[data-coach-doc-row="${def.k}"]`);
  if (!row) return;
  const raw = coach[def.byCoach];
  const has = filled(raw);
  row.classList.toggle('ok', has);
  row.classList.toggle('no', !has);
  const mark = row.querySelector('.mk');
  if (mark) mark.textContent = has ? '●' : '○';
  const view = row.querySelector('.vl');
  if (view) view.textContent = has ? cellText(raw) : '미제출';
  const input = row.querySelector('[data-coach-doc-input]');
  if (input) { input.value = docCellText(raw); input.classList.remove('bad'); }
  const check = row.querySelector('[data-coach-doc-toggle]');
  if (check) check.checked = has;
}
/**
 * 상세창 «전체 저장» — 고친 칸을 모아 한 번에 보낸다.
 * 기업 서류는 한 번의 통신으로 묶어 보내고, 코치 공통 서류만 따로 보낸다.
 * 형식이 틀린 칸이 하나라도 있으면 아무것도 보내지 않는다.
 */
function collectDrawerDocChanges(company) {
  const changes = [];
  DRAWER.querySelectorAll('[data-doc-row]').forEach(row => {
    const def = byDocKey(row.dataset.docRow);
    if (!def || !docEditable(def)) return;
    const input = row.querySelector('[data-doc-input]');
    const check = row.querySelector('[data-doc-toggle]');
    if (input) {
      const entered = input.value.trim();
      if (entered === docCellText(company.docs[def.k])) return;
      changes.push({ def, entered, input });
    } else if (check) {
      if (check.checked === filled(company.docs[def.k])) return;
      changes.push({ def, entered: check.checked ? 'O' : '', check });
    }
  });
  return changes;
}
async function saveAllDrawerDocs(company) {
  const year = getBaseYear();
  const changes = collectDrawerDocChanges(company);
  if (!changes.length) { toast('바뀐 칸이 없습니다'); return false; }

  for (const change of changes) {                 // 형식 검사가 먼저 — 하나라도 틀리면 중단
    if (change.def.type === 'mark') continue;
    if (change.entered && !monthDayToDate(change.entered, year)) {
      change.input.classList.add('bad');
      change.input.focus();
      toast(`${change.def.label} — 6/22 처럼 월/일로 적어주세요`);
      return false;
    }
  }

  const mine = changes.filter(x => !x.def.byCoach);
  const coachChanges = changes.filter(x => x.def.byCoach);
  let saved = 0;

  if (mine.length) {
    const docs = {};
    mine.forEach(x => { docs[x.def.k] = docSendValue(x.def, x.entered, year); });
    // 약정 시작일을 고치면 종료일(+28일)도 같이 — 단, 종료일을 직접 적었으면 그 값을 지킨다
    if (docs.teamStart !== undefined && docs.teamEnd === undefined) {
      const start = isoToDate(docs.teamStart);
      docs.teamEnd = start ? iso(addDays(start, 28)) : '';
    }
    const keys = Object.keys(docs);
    const rollback = {};
    keys.forEach(k => { rollback[k] = company.docs[k]; });
    keys.forEach(k => { company.docs[k] = localDocValue(k, docs[k]); });
    company.docCount = DOC_DEFS.filter(d => filled(company.docs[d.k])).length;
    repaintDocCells([company.name], keys);
    try {
      await requestSheetWrite(writeEndpoint(), 'updateDocs', {
        companyName: company.name,
        docs,
        _audit: {
          type: 'DOC',
          target: company.name,
          detail: `서류 ${mine.length}칸 한 번에 저장 — ` +
            mine.map(x => `${x.def.label}: ${x.entered || '지움'}`).join(', '),
          tone: 'info',
          before: rollback,
          after: docs
        }
      });
      saved += mine.length;
    } catch (e) {
      console.error(e);
      keys.forEach(k => { company.docs[k] = rollback[k]; });
      company.docCount = DOC_DEFS.filter(d => filled(company.docs[d.k])).length;
      repaintDocCells([company.name], keys);
      mine.forEach(x => { if (x.input) x.input.classList.add('bad'); });
      toast('저장 실패 — ' + (e.message || '저장 연결을 확인하세요'));
      return false;
    }
    // 수행일지를 고쳤으면 같은 차수의 컨설팅일도 맞춘다
    for (const change of mine) {
      if (!change.def.linkConsult || !docs[change.def.k]) continue;
      try {
        await syncConsultDateFromDoc(company, change.def.linkConsult, docs[change.def.k]);
      } catch (error) {
        console.error(error);
        toast(`${change.def.label}은 저장됐지만 컨설팅일 반영은 실패했습니다 — ${error.message || '저장 연결을 확인하세요'}`);
      }
    }
  }

  for (const change of coachChanges) {            // 코치 공통값은 한 건씩 (담당 기업 전체에 반영)
    const ok = await saveCoachDoc(company.coach, change.def, change.entered);
    if (ok) saved++;
    else if (change.input) change.input.classList.add('bad');
  }

  changes.forEach(change => refreshDrawerDocRow(company, change.def));
  refreshDrawerDocCounts(company);
  refreshDrawerConsultLines(company);
  render();
  toast(saved ? `${saved}칸 저장됨` : '저장된 칸이 없습니다');
  return saved > 0;
}

/** 저장 단추를 잠깐 «저장됨»으로 바꿔 알려준다 */
function flashSaveButton(btn) {
  btn.textContent = '저장됨';
  clearTimeout(btn._flashTimer);
  btn._flashTimer = setTimeout(() => { btn.textContent = '저장'; }, 1200);
}
const saveCoachDoc = (coach, def, entered) => {
  const sent = docSendValue(def, entered, getBaseYear());
  if (sent === null) { toast('6/22 처럼 월/일로 적어주세요'); return Promise.resolve(false); }
  return commitCoachDoc(null, coach, def, sent);
};

/** 시트는 날짜를 serial로 돌려주므로, 화면 값도 같은 형식으로 맞춰둔다 */
function localDocValue(key, sent) {
  if (!sent) return '';
  const def = byDocKey(key);
  if (def.type === 'mark' || def.type === 'range') return sent;
  const d = isoToDate(sent);
  return d ? String(serialOf(d)) : sent;
}

/* ============================================================
   10. 상세 패널(Drawer)
   ============================================================ */
const DRAWER = $('#drawer');
const DRAWER_BACKDROP = $('#drawerBackdrop');
let drawerReturnFocus = null;
function closeDrawer() {
  const wasOpen = DRAWER.classList.contains('open');
  DRAWER.classList.remove('open');
  DRAWER_BACKDROP.classList.remove('open');
  DRAWER.setAttribute('aria-hidden', 'true');
  DRAWER_BACKDROP.setAttribute('aria-hidden', 'true');
  if (wasOpen && drawerReturnFocus && document.contains(drawerReturnFocus)) drawerReturnFocus.focus();
}
function openDrawer(title, sub, bodyHTML, onMount) {
  drawerReturnFocus = document.activeElement;
  DRAWER.innerHTML =
    `<header><div style="flex:1"><h3>${title}</h3><div class="sub">${sub}</div></div>` +
    `<button class="btn icon" id="drawerX" aria-label="닫기">✕</button></header>` +
    `<div class="body">${bodyHTML}</div>`;
  $('#drawerX').onclick = closeDrawer;
  DRAWER.classList.add('open');
  DRAWER_BACKDROP.classList.add('open');
  DRAWER.setAttribute('aria-hidden', 'false');
  DRAWER_BACKDROP.setAttribute('aria-hidden', 'false');
  if (onMount) onMount(DRAWER);
  requestAnimationFrame(() => $('#drawerX', DRAWER).focus());
}
const copyLine = (v, label) => v
  ? `<button class="copy" data-copy="${esc(v)}" data-label="${esc(label)}">${esc(v)}</button>`
  : '<span class="dim">—</span>';

function openCompany(c, docsEditMode) {
  docsEditMode = !!docsEditMode;
  state.comp.sel = c.name;
  const workplace = c.workplace || {};
  const chk = STAGES.map(st => {
    const items = DOC_DEFS.filter(d => d.stage === st).map(d => {
      const has = filled(c.docs[d.k]);
      const note = d.byCoach ? '<em>코치 공통</em>' : d.type === 'auto' ? '<em>+28일 자동</em>' : '';
      if (docsEditMode) {
        let control;
        if (d.byCoach && !c.coach) {
          control = '<span class="drawer-doc-locked">코치 미배정</span>';
        } else if (d.type === 'mark') {
          control = `<label class="drawer-doc-check"><input type="checkbox" data-doc-toggle="${esc(d.k)}"${has ? ' checked' : ''}><span>제출</span></label>`;
        } else {
          control = `<div class="drawer-doc-control">
            <input type="text" inputmode="numeric" placeholder="6/22" value="${esc(docCellText(c.docs[d.k]))}" data-doc-input="${esc(d.k)}">
            <button class="drawer-doc-save" type="button" data-doc-save="${esc(d.k)}">저장</button>
          </div>`;
        }
        return `<div class="chk doc-row-edit ${has ? 'ok' : 'no'}" data-doc-row="${esc(d.k)}"><div class="mk">${has ? '●' : '○'}</div>` +
          `<div class="lb">${esc(d.label)}${note}</div>${control}</div>`;
      }
      return `<div class="chk ${has ? 'ok' : 'no'}" data-doc-row="${esc(d.k)}"><div class="mk">${has ? '●' : '○'}</div>` +
        `<div class="lb">${esc(d.label)}${note}</div>` +
        `<div class="vl">${has ? esc(cellText(c.docs[d.k])) : '미제출'}</div></div>`;
    }).join('');
    const n = DOC_DEFS.filter(d => d.stage === st && filled(c.docs[d.k])).length;
    const tot = DOC_DEFS.filter(d => d.stage === st).length;
    return `<div class="stage-head">${st} <span class="dim" data-stage-count="${esc(st)}">${n}/${tot}</span></div>${items}`;
  }).join('');

  const dd = c.dday == null ? '' :
    c.dday < 0 ? `<span style="color:var(--critical);font-weight:650">${-c.dday}일 경과</span>`
      : `<span${c.dday <= 14 ? ' style="font-weight:650"' : ''}>D-${c.dday}</span>`;
  const deadline = !c.end
    ? `<span class="dim">${esc(c.endRaw || '미정')}</span>`
    : c.extended
      ? `<span class="deadline-original">${korDate(c.end)}</span><span class="deadline-arrow">→</span>` +
        `<span class="deadline-extended">${korDate(c.effectiveEnd)}</span>`
      : korDate(c.end);
  const consultationLine = (item, fallbackDate) => {
    const date = item && item.date ? korDate(item.date)
      : item && item.dateRaw ? esc(item.dateRaw)
      : fallbackDate ? korDate(fallbackDate)
      : '<span class="dim">미정</span>';
    const time = item && item.time ? ` ${esc(item.time)}` : '';
    const visit = item && item.visit
      ? ` <span class="extension-badge">동행 · ${esc(item.owner || '담당자 미정')}</span>`
      : '';
    return `${date}${time}${visit}`;
  };
  const latestVisit = c.latestVisit && (c.latestVisit.owner || c.latestVisit.dateRaw || c.latestVisit.time)
    ? `${c.latestVisit.date ? korDate(c.latestVisit.date) : esc(c.latestVisit.dateRaw || '일자 미정')} ${esc(c.latestVisit.time || '')} · ${esc(c.latestVisit.owner || '담당자 미정')}`
    : '';

  openDrawer(esc(c.name), `${badge(c.status)} <span class="dim">담당 ${esc(c.owner || '미배정')}</span>`, `
    ${c.memo ? `<div class="sect memo-sect"><h4>메모</h4><p class="memo-text">${esc(c.memo)}</p></div>` : ''}
    <div class="sect"><h4>사업장 정보</h4><dl class="kv">
      <dt>근로자 수</dt><dd>${workplace.employeeCount ? `${esc(workplace.employeeCount)}명` : '<span class="dim">—</span>'}</dd>
      <dt>관리번호</dt><dd>${copyLine(workplace.managementNumber, '사업장관리번호')}</dd>
      <dt>주소</dt><dd>${esc(workplace.address || '—')}</dd>
      <dt>공단지사</dt><dd>${esc(workplace.agencyBranch || '—')}</dd>
      <dt>HRD4U</dt><dd>${copyLine(workplace.hrd4uId, 'HRD4U')}</dd>
    </dl></div>
    <div class="sect"><h4>기업 담당자</h4><dl class="kv">
      <dt>성명</dt><dd>${esc(c.contact.name || '—')} <span class="dim">${esc(c.contact.title)}</span></dd>
      <dt>연락처</dt><dd>${c.contact.phone.split('\n').map(p => copyLine(p.trim(), '연락처')).join('<br>')}</dd>
      <dt>이메일</dt><dd>${c.contact.email.split('\n').map(p => copyLine(p.trim(), '이메일')).join('<br>')}</dd>
    </dl></div>
    <div class="sect"><h4>일정</h4><dl class="kv">
      <dt>1차 컨설팅</dt><dd data-consult-line="1">${consultationLine(c.consultations[0], c.start)}</dd>
      <dt>2차 컨설팅</dt><dd data-consult-line="2">${consultationLine(c.consultations[1], null)}</dd>
      ${latestVisit ? `<dt>최근 방문</dt><dd>${latestVisit}</dd>` : ''}
      <dt>종료 기한</dt><dd>${deadline} ${dd}</dd>
      <dt>2주 연장</dt><dd><label class="extension-toggle">
        <input type="checkbox" id="extensionCheck"${c.extended ? ' checked' : ''}${c.end ? '' : ' disabled'}>
        <span>14일 연장 적용</span>
      </label></dd>
      <dt>약정 기간</dt><dd class="dim">${esc(cellText(c.docs.teamStart) || '—')} ~ ${esc(cellText(c.docs.teamEnd) || '—')}</dd>
    </dl></div>
    <div class="sect"><h4>배정 코치</h4><dl class="kv">
      <dt>코치</dt><dd>${c.coachName ? esc(c.coachName) : '<span class="dim">미배정</span>'}</dd>
      <dt>연락처</dt><dd>${copyLine(c.coachPhone, '코치 연락처')}</dd>
      <dt>이메일</dt><dd>${copyLine(c.coachEmail, '코치 이메일')}</dd>
    </dl></div>
    <div class="sect">
      <div class="sect-head"><h4 data-doc-total>서류 ${c.docCount}/${DOC_DEFS.length}</h4>
        ${docsEditMode ? '<button class="doc-edit-toggle save-all" type="button" id="saveAllDocs">전체 저장</button>' : ''}
        <button class="doc-edit-toggle" type="button" id="editDocs">${docsEditMode ? '완료' : '수정'}</button>
      </div>
      <div class="coach-doc-note">서식8·9·10·통장 사본은 배정 코치의 공통값이며, 수정하면 같은 코치의 모든 기업에 반영됩니다.</div>
      <div class="checklist">${chk}</div>
    </div>
    <div class="sect"><button class="btn primary" id="toMail" style="width:100%">이 기업으로 메일 작성 →</button></div>
  `, d => {
    $('#editDocs', d).onclick = () => {
      openCompany(c, !docsEditMode);
      requestAnimationFrame(() => $('#editDocs', DRAWER)?.focus());
    };
    if (docsEditMode) {
      const saveAll = $('#saveAllDocs', d);
      saveAll.onclick = async () => {
        saveAll.disabled = true;
        saveAll.textContent = '저장 중';
        try { await saveAllDrawerDocs(c); }
        finally {
          const live = $('#saveAllDocs', DRAWER);
          if (live) { live.disabled = false; live.textContent = '전체 저장'; live.focus(); }
        }
      };
      d.querySelectorAll('[data-doc-toggle]').forEach(box => {
        box.onchange = async e => {
          const check = e.currentTarget;
          const def = byDocKey(check.dataset.docToggle);
          check.disabled = true;
          const saved = await saveDocCell(c, def, check.checked ? 'O' : '');
          check.disabled = false;
          if (saved) refreshDrawerDocRow(c, def);
          else check.checked = filled(c.docs[def.k]);   // 저장이 안 되면 표시를 되돌린다
          check.focus();
        };
      });
      d.querySelectorAll('[data-doc-save]').forEach(btn => {
        const input = btn.parentElement.querySelector('[data-doc-input]');
        const save = async () => {
          const def = byDocKey(btn.dataset.docSave);
          const entered = input.value.trim();
          if (entered && !monthDayToDate(entered, getBaseYear())) {
            input.classList.add('bad');
            input.focus();
            toast('6/22 처럼 월/일로 적어주세요');
            return;
          }
          btn.disabled = true;
          input.disabled = true;
          btn.textContent = '저장 중';
          const saved = await saveDocCell(c, def, entered);
          btn.disabled = false;
          input.disabled = false;
          btn.textContent = '저장';
          /*
           * 저장한 줄만 다시 그린다 — 아래·위 다른 칸에 적어둔 내용은 그대로 남는다.
           * 실패하면 적은 값을 그대로 두고 붉게 표시해, 고쳐서 다시 누를 수 있게 한다.
           */
          if (saved) {
            refreshDrawerDocRow(c, def);
            if (def.linkConsult) refreshDrawerConsultLines(c);
            flashSaveButton(btn);
          } else {
            input.classList.add('bad');
          }
          input.focus();
          input.select();
        };
        btn.onclick = save;
        input.oninput = () => input.classList.remove('bad');
        input.onkeydown = e => {
          if (e.key === 'Enter') { e.preventDefault(); save(); }
          // Esc = 이 칸만 저장된 값으로 되돌리기 (다른 칸은 건드리지 않는다)
          if (e.key === 'Escape') { e.preventDefault(); input.value = docCellText(c.docs[btn.dataset.docSave]); input.classList.remove('bad'); }
        };
      });
    }
    $('#extensionCheck', d).onchange = async e => {
      const enabled = e.target.checked;
      e.target.disabled = true;
      const saved = await setCompanyExtension(c, enabled);
      if (!saved) {
        e.target.checked = !enabled;
        e.target.disabled = false;
        return;
      }
      if (typeof renderActivityLogs === 'function') renderActivityLogs();
      render();
      openCompany(c, docsEditMode);
      requestAnimationFrame(() => $('#extensionCheck', DRAWER)?.focus());
      toast(enabled ? `${c.name} 종료 기한을 2주 연장했습니다.` : `${c.name} 2주 연장을 해제했습니다.`);
    };
    $('#toMail', d).onclick = () => {
      closeDrawer();
      go('mail', { company: c.name, stage: guessStage(c), target: '기업 담당자', manual: '' });
    };
  });
}

/** 진행현황으로 메일 단계를 추정 */
function guessStage(c) {
  return ({ 검토요청: '신청단계', 검토완료: '신청단계', 컨설팅진행: '실시단계', 보고서제출: '실시단계', 지급준비: '지급단계', 지급완료: '지급단계' })[c.status] || '신청단계';
}

function openCoach(c, docsEditMode) {
  docsEditMode = !!docsEditMode;
  state.coach.sel = c.name;
  const coachDocs = DOC_DEFS.filter(def => def.byCoach).map(def => {
    const raw = c[def.byCoach];
    const has = filled(raw);
    if (!docsEditMode) {
      return `<div class="chk ${has ? 'ok' : 'no'}" data-coach-doc-row="${esc(def.k)}"><div class="mk">${has ? '●' : '○'}</div>` +
        `<div class="lb">${esc(def.label)}</div><div class="vl">${has ? esc(cellText(raw)) : '미제출'}</div></div>`;
    }
    const control = def.type === 'mark'
      ? `<label class="drawer-doc-check"><input type="checkbox" data-coach-doc-toggle="${esc(def.k)}"${has ? ' checked' : ''}><span>제출</span></label>`
      : `<div class="drawer-doc-control">
          <input type="text" inputmode="numeric" placeholder="6/22" value="${esc(docCellText(raw))}" data-coach-doc-input="${esc(def.k)}">
          <button class="drawer-doc-save" type="button" data-coach-doc-save="${esc(def.k)}">저장</button>
        </div>`;
    return `<div class="chk doc-row-edit ${has ? 'ok' : 'no'}" data-coach-doc-row="${esc(def.k)}"><div class="mk">${has ? '●' : '○'}</div>` +
      `<div class="lb">${esc(def.label)}<em>코치 공통</em></div>${control}</div>`;
  }).join('');
  const comps = c.companies.length
    ? c.companies.map(x => `<div class="chk"><div class="mk"></div><div class="lb">${esc(x.name)}</div>` +
        `<div class="vl">${esc(x.status)}</div></div>`).join('')
    : '<div class="empty">배정된 기업이 없습니다.</div>';

  openDrawer(esc(c.name), `<span class="dim">내부 담당 ${esc(c.owner || '—')} · 담당 기업 ${c.companies.length}개사</span>`, `
    <div class="sect"><h4>연락처</h4><dl class="kv">
      <dt>휴대폰</dt><dd>${copyLine(c.phone, '연락처')}</dd>
      <dt>이메일</dt><dd>${copyLine(c.email, '이메일')}</dd>
      <dt>아이디</dt><dd>${esc(c.loginId || '—')}</dd>
    </dl></div>
    <div class="sect">
      <div class="sect-head"><h4>제출 서류</h4>
        <button class="doc-edit-toggle" type="button" id="editCoachDocs">${docsEditMode ? '완료' : '수정'}</button>
      </div>
      <div class="coach-doc-note">이 값은 이 코치가 담당하는 모든 기업의 서류 현황에 함께 반영됩니다.</div>
      <div class="checklist">${coachDocs}</div>
    </div>
    <div class="sect"><h4>담당 기업</h4><div class="checklist">${comps}</div></div>
    <div class="sect"><h4>개인정보</h4>
      <details><summary class="dim" style="cursor:pointer;font-size:12.5px">표시하기</summary>
      <dl class="kv" style="margin-top:8px">
        <dt>생년월일</dt><dd>${esc(c.birth || '—')}</dd>
        <dt>주소</dt><dd>${esc(c.address || '—')}</dd>
      </dl></details>
    </div>
  `, d => {
    $('#editCoachDocs', d).onclick = () => {
      openCoach(c, !docsEditMode);
      requestAnimationFrame(() => $('#editCoachDocs', DRAWER)?.focus());
    };
    if (!docsEditMode) return;
    d.querySelectorAll('[data-coach-doc-toggle]').forEach(box => {
      box.onchange = async e => {
        const check = e.currentTarget;
        const def = byDocKey(check.dataset.coachDocToggle);
        check.disabled = true;
        const saved = await saveCoachDoc(c, def, check.checked ? 'O' : '');
        check.disabled = false;
        if (saved) refreshCoachDocRow(c, def);
        else check.checked = filled(c[def.byCoach]);
        check.focus();
      };
    });
    d.querySelectorAll('[data-coach-doc-save]').forEach(btn => {
      const input = btn.parentElement.querySelector('[data-coach-doc-input]');
      const save = async () => {
        const def = byDocKey(btn.dataset.coachDocSave);
        const entered = input.value.trim();
        if (entered && !monthDayToDate(entered, getBaseYear())) {
          input.classList.add('bad');
          input.focus();
          toast('6/22 처럼 월/일로 적어주세요');
          return;
        }
        btn.disabled = true;
        input.disabled = true;
        btn.textContent = '저장 중';
        const saved = await saveCoachDoc(c, def, entered);
        btn.disabled = false;
        input.disabled = false;
        btn.textContent = '저장';
        if (saved) { refreshCoachDocRow(c, def); flashSaveButton(btn); }
        else input.classList.add('bad');
        input.focus();
        input.select();
      };
      btn.onclick = save;
      input.oninput = () => input.classList.remove('bad');
      input.onkeydown = e => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { e.preventDefault(); input.value = docCellText(c[byDocKey(btn.dataset.coachDocSave).byCoach]); input.classList.remove('bad'); }
      };
    });
  });
}
