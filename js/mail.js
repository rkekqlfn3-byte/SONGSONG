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

/**
 * 날짜는 규칙으로 계산하지 않고 사람이 직접 고른다.
 * 「시작일+28일」 같은 규칙을 두면 예외가 생길 때마다 손댈 수 없어서,
 * 메일마다 달력에서 고르는 쪽이 실제 운영에 맞는다.
 */
function pickedDate(value) {
  if (!value) return null;
  const d = new Date(value + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

/** 제목·본문에 그 자리가 쓰였는지 */
const mailUses = (tpl, token) =>
  !!tpl && (String(tpl.subject || '') + String(tpl.body || '')).includes(`{{${token}}}`);

/**
 * 시트 칸에 붙여넣을 때 앞뒤로 딸려 들어온 따옴표를 떼어낸다.
 * 그대로 두면 메일 첫 줄과 끝 줄에 «"» 가 찍혀 나간다.
 */
function trimQuotes(text) {
  const t = String(text == null ? '' : text);
  return (t.length > 1 && t[0] === '"' && t[t.length - 1] === '"') ? t.slice(1, -1) : t;
}

/** 한글·한자는 두 칸을 차지한다 — 글자 표의 세로줄을 맞추려면 이 폭으로 세야 한다 */
const cellWidth = s => [...String(s)].reduce((n, ch) =>
  n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(ch) ? 2 : 1), 0);
const padCell = (s, w) => String(s) + ' '.repeat(Math.max(0, w - cellWidth(s)));

/** 메일에 넣을 «글자 표». 메일 앱이 서식을 못 받아도 모양이 유지된다 */
function textTable(head, rows) {
  const widths = head.map((h, i) =>
    Math.max(cellWidth(h), ...rows.map(r => cellWidth(r[i] || '')), 8) + 2);
  const line = (l, m, r) => l + widths.map(w => '─'.repeat(w)).join(m) + r;
  const row = cells => '│' + cells.map((c, i) => ' ' + padCell(c || '', widths[i] - 1)).join('│') + '│';
  return [line('┌', '┬', '┐'), row(head), line('├', '┼', '┤'), ...rows.map(row), line('└', '┴', '┘')].join('\n');
}

/** 같은 표를 메일 앱이 알아듣는 서식으로 — 받는 사람이 칸에 바로 적을 수 있다 */
function htmlTable(head, rows) {
  const td = (v, isHead) => `<${isHead ? 'th' : 'td'} style="border:1px solid #999;padding:6px 12px;` +
    `${isHead ? 'background:#f2f2f2;font-weight:bold;' : ''}min-width:120px;height:24px;">${esc(v || '')}</${isHead ? 'th' : 'td'}>`;
  return `<table style="border-collapse:collapse;margin:8px 0;font-size:13px;">` +
    `<tr>${head.map(h => td(h, true)).join('')}</tr>` +
    rows.map(r => `<tr>${head.map((_, i) => td(r[i], false)).join('')}</tr>`).join('') +
    `</table>`;
}

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

  /* --- 날짜 (본문에서 쓰는 것만 칸이 생긴다) --- */
  const needDeadline = mailUses(tpl, '기한');
  const needSchedule = mailUses(tpl, '일정');
  const dateField = (label, hint, value, on) => {
    const f = el('div', 'field');
    f.innerHTML = `<label>${esc(label)} <span class="dim">${esc(hint)}</span></label>`;
    const di = el('input'); di.type = 'date'; di.value = value || '';
    di.onchange = () => { on(di.value); render(); };
    f.appendChild(di);
    left.appendChild(f);
  };
  if (needDeadline) dateField('제출 기한', '본문의 «기한» 자리', s.deadline, v => { s.deadline = v; });
  if (needSchedule) dateField(tpl.schedName || '일정', '본문의 «일정» 자리', s.manual, v => { s.manual = v; });

  const deadlineDate = pickedDate(s.deadline);
  const scheduleDate = pickedDate(s.manual);

  /* --- 조건 요약 --- */
  const info = el('div', 'field');
  if (!tpl) {
    info.innerHTML = `<div class="note"><b>${esc(s.stage)} · ${esc(s.target)}</b><br>` +
      '이 조합은 메일을 보내지 않습니다.<br>' +
      '<span class="dim">보내야 한다면 시트 «메일DB» 탭에 줄을 추가하세요.</span></div>';
  } else {
    const bits = [];
    if (tpl.sendWhen) bits.push(`<b>발송 시점</b> ${esc(tpl.sendWhen)}`);
    if (needDeadline) bits.push(`<b>제출 기한</b> ` + (deadlineDate ? korDate(deadlineDate)
      : '<span style="color:var(--critical)">날짜를 골라주세요</span>'));
    if (needSchedule) bits.push(`<b>${esc(tpl.schedName || '일정')}</b> ` + (scheduleDate ? korDate(scheduleDate)
      : '<span style="color:var(--critical)">날짜를 골라주세요</span>'));
    info.innerHTML = `<div class="note">${bits.join('<br>') || '<span class="dim">고를 것이 없습니다.</span>'}</div>`;
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
    const schedText = scheduleDate ? korDate(scheduleDate) : '';
    const deadlineText = deadlineDate ? korDate(deadlineDate) : '';
    const names = picked.map(x => x.name);

    // 「기업명 / HRD4U 아이디」 표 — 아이디 칸은 받는 사람이 채우도록 비워 둔다
    const idHead = ['기업명', 'HRD4U 아이디'];
    const idRows = names.map(n => [n, '']);

    const fill = t => trimQuotes(t)
      .replace(/\{\{기업명\}\}/g, toCoach ? names.join(', ') : c.name)
      .replace(/\{\{기업수\}\}/g, String(names.length))
      .replace(/\{\{기업목록\}\}/g, names.join(', '))
      .replace(/\{\{기업목록줄\}\}/g, names.map(n => ` - ${n}`).join('\n'))
      .replace(/\{\{기한\}\}/g, deadlineText || '(기한 미정)')
      .replace(/\{\{일정\}\}/g, schedText || '(일정 미정)');
    const subject = fill(tpl.subject).replace(/¶/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
    const bodyRaw = fill(String(tpl.body || '').replace(/¶/g, '\n'));
    // 글자로 된 표 (그냥 복사할 때) 와 서식 있는 표 (서식 복사할 때) 를 따로 만든다
    const body = bodyRaw.replace(/\{\{HRD4U표\}\}/g, textTable(idHead, idRows));
    const bodyHtml = bodyRaw.split('{{HRD4U표}}')
      .map(part => esc(part).replace(/\n/g, '<br>'))
      .join(htmlTable(idHead, idRows));

    const problems = [];
    if (!to) problems.push(`${toCoach ? '코치' : '기업 담당자'}의 이메일 주소가 비어 있습니다.`);
    if (needDeadline && !deadlineText) problems.push('제출 기한을 골라주세요.');
    if (needSchedule && !schedText) problems.push(`${tpl.schedName || '일정'} 날짜를 골라주세요.`);

    const out = card('메일 내용', `${tpl.stage} · ${tpl.target}${toCoach ? ` · 기업 ${names.length}곳` : ''}`);
    const block = (label, value, cls, id) => `
      <div class="out"><div class="out-head"><label>${esc(label)}</label><div class="spacer"></div>
      <button class="btn" data-copy="${esc(value)}" data-label="${esc(label)}">복사</button></div>
      <div class="box ${cls || ''}" id="${id || ''}">${esc(value) || '<span class="dim">—</span>'}</div></div>`;

    out.insertAdjacentHTML('beforeend',
      (problems.length ? `<div class="note bad" style="margin-bottom:12px"><b>확인 필요</b><br>${problems.map(esc).join('<br>')}</div>` : '') +
      block('받는 사람', to ? `${toName ? toName + ' <' + to + '>' : to}` : '', 'mono') +
      block('메일 제목', subject) +
      `<div class="out"><div class="out-head"><label>메일 본문</label><div class="spacer"></div>
        <button class="btn" id="copyBodyRich">서식 그대로 복사</button>
        <button class="btn" id="copyBodyText">글자만 복사</button></div>
        <div class="box body mail-body-html">${bodyHtml}</div></div>` +
      (tpl.attach && tpl.attach !== '없음'
        ? `<div class="note warn"><b>첨부 / 서류</b><br>${esc(tpl.attach).replace(/¶/g, '<br>')}</div>`
        : '<div class="note"><span class="dim">첨부 서류 없음</span></div>'));

    out.querySelector('#copyBodyText').onclick = () => copy(body, '본문');
    out.querySelector('#copyBodyRich').onclick = () => copyRich(bodyHtml, body, '본문(서식 포함)');

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
