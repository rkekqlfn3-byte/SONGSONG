/* ============================================================
   11. 메일 작성기

   보내는 메일은 두 가지 성격이 섞여 있다.
   · 기업 담당자에게 → 기업 «한 곳»에 대한 메일
   · 훈련코치에게    → 코치 «한 명»에게 그가 맡은 기업 «여러 곳»을 한꺼번에

   그래서 받는 대상이 코치면 기업이 아니라 코치를 고르고,
   그 코치의 기업 목록이 저절로 따라온다. 뺄 곳은 체크를 풀면 된다.
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

/** 제목·본문에 그 자리가 쓰였는지 */
const mailUses = (tpl, token) =>
  !!tpl && (String(tpl.subject || '') + String(tpl.body || '')).includes(`{{${token}}}`);

function viewMail() {
  const s = state.mail;
  const { companies, coaches, templates } = state.M;
  const tpl = templates.find(t => t.stage === s.stage && t.target === s.target);
  const toCoach = s.target === '훈련코치';

  const left = card('메일 조건');
  const seg = (val, opts, on) => {
    const w = el('div', 'seg');
    w.innerHTML = opts.map(o => `<button aria-pressed="${o === val}" data-v="${esc(o)}">${esc(o)}</button>`).join('');
    w.onclick = e => { const b = e.target.closest('button'); if (b) on(b.dataset.v); };
    return w;
  };
  const f1 = el('div', 'field'); f1.innerHTML = '<label>단계</label>';
  f1.appendChild(seg(s.stage, MAIL_STAGES, v => { s.stage = v; s.drop = {}; render(); }));
  const f2 = el('div', 'field'); f2.innerHTML = '<label>받는 대상</label>';
  f2.appendChild(seg(s.target, MAIL_TARGETS, v => { s.target = v; s.drop = {}; render(); }));
  left.append(f1, f2);

  /* --- 받는 사람 고르기 --- */
  const coach = toCoach ? coaches.find(k => k.name === s.coach) || null : null;
  let picked = [];                                   // 이 메일이 다루는 기업들
  let c = null;                                      // 기업 담당자 메일일 때의 그 기업

  if (toCoach) {
    const f3 = el('div', 'field'); f3.innerHTML = '<label>훈련코치</label>';
    const ksel = el('select');
    ksel.innerHTML = '<option value="">— 코치를 선택하세요 —</option>' +
      [...coaches].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map(k =>
        `<option value="${esc(k.name)}"${k.name === s.coach ? ' selected' : ''}>${esc(k.name)} · 담당 기업 ${k.companies.length}곳</option>`).join('');
    ksel.onchange = () => { s.coach = ksel.value; s.drop = {}; render(); };
    f3.appendChild(ksel);
    left.appendChild(f3);

    if (coach) {
      const all = [...coach.companies].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      picked = all.filter(x => !s.drop[x.name]);
      const f4 = el('div', 'field');
      f4.innerHTML = `<label>대상 기업 <span class="dim">${picked.length}/${all.length}곳 · 뺄 곳은 체크를 푸세요</span></label>`;
      const list = el('div', 'mail-picklist');
      all.forEach(x => {
        const l = el('label', 'mail-pick');
        l.innerHTML = `<input type="checkbox"${s.drop[x.name] ? '' : ' checked'}>` +
          `<span>${esc(x.name)}<em>${esc(x.status)}</em></span>`;
        l.querySelector('input').onchange = e => {
          if (e.target.checked) delete s.drop[x.name]; else s.drop[x.name] = true;
          render();
        };
        list.appendChild(l);
      });
      if (!all.length) list.appendChild(el('div', 'empty', '이 코치에게 배정된 기업이 없습니다.'));
      f4.appendChild(list);
      left.appendChild(f4);
    }
  } else {
    c = companies.find(x => x.name === s.company) || null;
    picked = c ? [c] : [];
    const f3 = el('div', 'field'); f3.innerHTML = '<label>기업</label>';
    const csel = el('select');
    csel.innerHTML = '<option value="">— 기업을 선택하세요 —</option>' +
      companies.map(x => `<option value="${esc(x.name)}"${x.name === s.company ? ' selected' : ''}>${esc(x.name)} · ${esc(x.status)}${x.coachName ? ' · ' + esc(x.coachName) : ''}</option>`).join('');
    csel.onchange = () => { s.company = csel.value; render(); };
    f3.appendChild(csel);
    left.appendChild(f3);
  }

  /* --- 제출 기한 (템플릿이 쓸 때만 나온다) --- */
  const needDeadline = mailUses(tpl, '기한');
  if (needDeadline) {
    const f = el('div', 'field');
    f.innerHTML = '<label>제출 기한 <span class="dim">본문의 «기한» 자리에 들어갑니다</span></label>';
    const di = el('input'); di.type = 'date'; di.value = s.deadline;
    di.onchange = () => { s.deadline = di.value; render(); };
    f.appendChild(di);
    left.appendChild(f);
  }

  const schedBase = toCoach ? (picked[0] || null) : c;
  const sched = tpl ? resolveSchedule(tpl, schedBase, s.manual) : null;
  if (tpl && tpl.schedSrc === '직접 입력' && mailUses(tpl, '일정')) {
    const f = el('div', 'field');
    f.innerHTML = `<label>${esc(tpl.schedName || '일정')} — 직접 입력</label>`;
    const di = el('input'); di.type = 'date'; di.value = s.manual;
    di.onchange = () => { s.manual = di.value; render(); };
    f.appendChild(di);
    left.appendChild(f);
  }

  /* --- 조건 요약 --- */
  const info = el('div', 'field');
  if (!tpl) {
    info.innerHTML = `<div class="note"><b>${esc(s.stage)} · ${esc(s.target)}</b><br>` +
      '이 조합은 메일을 보내지 않습니다.<br>' +
      '<span class="dim">보내야 한다면 시트 «메일DB» 탭에 줄을 추가하세요.</span></div>';
  } else {
    const bits = [`<b>발송 시점</b> ${esc(tpl.sendWhen)}`];
    if (sched && !sched.none && mailUses(tpl, '일정')) {
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
  const ready = tpl && (toCoach ? !!(coach && picked.length) : !!c);
  if (!ready) {
    const ph = card('메일 내용');
    ph.appendChild(el('div', 'empty',
      !tpl ? '이 조합은 메일을 보내지 않습니다. 위에서 다른 단계나 대상을 골라보세요.'
        : toCoach ? (coach ? '보낼 기업을 한 곳 이상 체크해주세요.' : '코치를 선택하면 제목과 본문이 만들어집니다.')
          : '기업을 선택하면 제목과 본문이 만들어집니다.'));
    right.appendChild(ph);
  } else {
    const to = toCoach ? (coach.email || (picked[0] && picked[0].coachEmail) || '') : c.contact.email;
    const toName = toCoach ? coach.name : c.contact.name;
    const schedText = sched && sched.date ? korDate(sched.date) : '';
    const deadlineDate = s.deadline ? new Date(s.deadline + 'T00:00:00') : null;
    const deadlineText = deadlineDate && !isNaN(deadlineDate) ? korDate(deadlineDate) : '';
    const names = picked.map(x => x.name);

    const fill = t => String(t || '')
      .replace(/\{\{기업명\}\}/g, toCoach ? names.join(', ') : c.name)
      .replace(/\{\{기업수\}\}/g, String(names.length))
      .replace(/\{\{기업목록\}\}/g, names.join(', '))
      .replace(/\{\{기업목록줄\}\}/g, names.map(n => ` - ${n}`).join('\n'))
      .replace(/\{\{기한\}\}/g, deadlineText || '(기한 미정)')
      .replace(/\{\{일정\}\}/g, schedText || '(일정 미정)');
    const subject = fill(tpl.subject).replace(/¶/g, ' ').trim();
    const body = fill(String(tpl.body || '').replace(/¶/g, '\n'));

    const problems = [];
    if (!to) problems.push(`${toCoach ? '코치' : '기업 담당자'}의 이메일 주소가 비어 있습니다.`);
    if (needDeadline && !deadlineText) problems.push('제출 기한을 골라주세요.');
    if (sched && !sched.none && mailUses(tpl, '일정') && !sched.date) problems.push(`${tpl.schedName}을(를) 확정하지 못했습니다.`);

    const out = card('메일 내용', `${tpl.stage} · ${tpl.target}${toCoach ? ` · 기업 ${names.length}곳` : ''}`);
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
        ? `<div class="note warn"><b>첨부 / 서류</b><br>${esc(tpl.attach).replace(/¶/g, '<br>')}</div>`
        : '<div class="note"><span class="dim">첨부 서류 없음</span></div>'));

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
