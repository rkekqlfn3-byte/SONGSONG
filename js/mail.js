/* ============================================================
   11. 메일 작성기
   ============================================================ */
const MAIL_STAGES = ['신청단계', '확정단계', '실시단계', '지급단계'];
const MAIL_TARGETS = ['기업 담당자', '훈련코치'];

/** 메일DB의 «일정 출처» 규칙을 그대로 계산 */
function resolveSchedule(tpl, c, manual) {
  const src = tpl.schedSrc || '';
  const startDoc = c ? toDate(c.docs.teamStart) : null;      // 서류!K 시작 날짜
  if (src === '없음' || !src) return { date: null, none: true };
  if (src === '직접 입력') {
    const d = manual ? new Date(manual + 'T00:00:00') : null;
    return d && !isNaN(d) ? { date: d, manual: true } : { date: null, needManual: true };
  }
  if (src === '서류 시작일') return startDoc ? { date: startDoc } : { date: null, missing: '서류 탭의 «약정 시작일»' };
  if (src === '시작일+28일') return startDoc ? { date: addDays(startDoc, 28) } : { date: null, missing: '서류 탭의 «약정 시작일»' };
  if (src === '오늘+3일') return { date: addDays(TODAY, 3) };
  return { date: null, missing: src };
}

function viewMail() {
  const s = state.mail;
  const { companies, templates } = state.M;
  const tpl = templates.find(t => t.stage === s.stage && t.target === s.target);
  const c = companies.find(x => x.name === s.company) || null;

  const left = card('메일 조건');
  const seg = (val, opts, on) => {
    const w = el('div', 'seg');
    w.innerHTML = opts.map(o => `<button aria-pressed="${o === val}" data-v="${esc(o)}">${esc(o)}</button>`).join('');
    w.onclick = e => { const b = e.target.closest('button'); if (b) on(b.dataset.v); };
    return w;
  };
  const f1 = el('div', 'field'); f1.innerHTML = '<label>단계</label>';
  f1.appendChild(seg(s.stage, MAIL_STAGES, v => { s.stage = v; render(); }));
  const f2 = el('div', 'field'); f2.innerHTML = '<label>받는 대상</label>';
  f2.appendChild(seg(s.target, MAIL_TARGETS, v => { s.target = v; render(); }));

  const f3 = el('div', 'field'); f3.innerHTML = '<label>기업</label>';
  const csel = el('select');
  csel.innerHTML = '<option value="">— 기업을 선택하세요 —</option>' +
    companies.map(x => `<option value="${esc(x.name)}"${x.name === s.company ? ' selected' : ''}>${esc(x.name)} · ${esc(x.status)}${x.coachName ? ' · ' + esc(x.coachName) : ''}</option>`).join('');
  csel.onchange = () => { s.company = csel.value; render(); };
  f3.appendChild(csel);
  left.append(f1, f2, f3);

  const sched = tpl ? resolveSchedule(tpl, c, s.manual) : null;
  if (tpl && tpl.schedSrc === '직접 입력') {
    const f4 = el('div', 'field');
    f4.innerHTML = `<label>${esc(tpl.schedName)} — 직접 입력</label>`;
    const di = el('input'); di.type = 'date'; di.value = s.manual;
    di.onchange = () => { s.manual = di.value; render(); };
    f4.appendChild(di); left.appendChild(f4);
  }

  // 조건 요약
  const info = el('div', 'field');
  if (!tpl) {
    info.innerHTML = `<div class="note bad">${esc(s.stage)} × ${esc(s.target)} 조합의 템플릿이 메일DB에 없습니다.</div>`;
  } else {
    const bits = [`<b>발송 시점</b> ${esc(tpl.sendWhen)}`];
    if (!sched.none) {
      bits.push(`<b>${esc(tpl.schedName)}</b> ` + (sched.date ? korDate(sched.date)
        : sched.needManual ? '<span style="color:var(--critical)">날짜를 입력하세요</span>'
        : `<span style="color:var(--critical)">${esc(sched.missing)} 값이 비어 있습니다</span>`));
      bits.push(`<span class="dim">산출 규칙: ${esc(tpl.schedSrc)}</span>`);
    }
    info.innerHTML = `<div class="note">${bits.join('<br>')}</div>`;
  }
  left.appendChild(info);

  /* --- 결과 --- */
  const right = el('div');
  if (!tpl || !c) {
    const ph = card('메일 내용');
    ph.appendChild(el('div', 'empty', tpl ? '기업을 선택하면 제목과 본문이 만들어집니다.' : '메일DB에서 템플릿을 찾지 못했습니다.'));
    right.appendChild(ph);
  } else {
    const to = s.target === '기업 담당자' ? c.contact.email : c.coachEmail;
    const toName = s.target === '기업 담당자' ? c.contact.name : c.coachName;
    const schedText = sched.date ? korDate(sched.date) : '';
    const fill = t => t.replace(/\{\{기업명\}\}/g, c.name).replace(/\{\{일정\}\}/g, schedText || '(일정 미정)');
    const subject = fill(tpl.subject);
    const body = fill(tpl.body).replace(/¶/g, '\n');

    const problems = [];
    if (!to) problems.push(`${s.target}의 이메일 주소가 비어 있습니다.`);
    if (!sched.none && !sched.date) problems.push(`${tpl.schedName}을(를) 확정하지 못했습니다.`);

    const out = card('메일 내용', `${tpl.stage} · ${tpl.target}`);
    const block = (label, value, cls, id) => `
      <div class="out"><div class="out-head"><label>${esc(label)}</label><div class="spacer"></div>
      <button class="btn" data-copy="${esc(value)}" data-label="${esc(label)}">복사</button></div>
      <div class="box ${cls || ''}" id="${id || ''}">${esc(value) || '<span class="dim">—</span>'}</div></div>`;

    out.insertAdjacentHTML('beforeend',
      (problems.length ? `<div class="note bad" style="margin-bottom:12px"><b>확인 필요</b><br>${problems.map(esc).join('<br>')}</div>` : '') +
      block('받는 사람', to ? `${toName ? toName + ' <' + to + '>' : to}` : '', 'mono') +
      block('메일 제목', subject) +
      block('메일 본문', body, 'body') +
      (tpl.attach && tpl.attach !== '없음'
        ? `<div class="note warn"><b>첨부 / 서류</b><br>${esc(tpl.attach)}</div>`
        : `<div class="note"><span class="dim">첨부 서류 없음</span></div>`));

    const acts = el('div', 'toolbar'); acts.style.marginTop = '12px';
    const bAll = el('button', 'btn', '제목+본문 한번에 복사');
    bAll.onclick = () => copy(subject + '\n\n' + body, '제목과 본문');
    const bMail = el('button', 'btn primary', '메일 앱에서 열기');
    bMail.disabled = !to;
    bMail.onclick = () => { location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; };
    acts.append(bAll, bMail);
    out.appendChild(acts);
    right.appendChild(out);
  }

  const grid = el('div', 'mail-grid');
  grid.append(left, right);
  return grid;
}

