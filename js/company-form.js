/* ============================================================
   13. 기업 추가 — 입력 창과 시트 저장
   ============================================================ */
const COMPANY_DIALOG = $('#companyDialog');
const COMPANY_FORM = $('#companyForm');
const COMPANY_STATE = $('#companyState');
let companyReturnFocus = null;
let companyEditTarget = null;
let companyScheduleEdited = false;
let companySaving = false;
const COMPANY_STEPS = ['basic', 'schedule', 'docs'];
const OPTIONAL_COMPANY_FIELDS = [
  'newOwner', 'newCoach', 'newContactName', 'newContactTitle',
  'newContactPhone', 'newContactEmail', 'newEmployeeCount', 'newWorkplaceNumber',
  'newCompanyAddress', 'newAgencyBranch', 'newHrd4uId',
  'newConsult1Date', 'newConsult2Date',
];

function setCompanyState(message, tone) {
  COMPANY_STATE.textContent = message || '';
  COMPANY_STATE.className = 'company-state' + (message ? ` show ${tone || ''}` : '');
}
function fieldHasValue(id) {
  const box = $('#' + id);
  return !!box && (box.type === 'checkbox' ? box.checked : !!box.value.trim());
}
function setCompanyFormStep(step, focusFirst) {
  const next = COMPANY_STEPS.includes(step) ? step : 'basic';
  COMPANY_FORM.querySelectorAll('.company-form-tab').forEach(button => {
    const active = button.dataset.companyStep === next;
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  });
  COMPANY_FORM.querySelectorAll('.company-step-panel').forEach(panel => {
    panel.hidden = panel.dataset.companyStepPanel !== next;
  });
  if (next === 'docs') $('#companyDocs').open = true;
  const body = $('.company-body', COMPANY_FORM);
  if (body) body.scrollTop = 0;
  if (focusFirst) {
    const panel = $(`[data-company-step-panel="${next}"]`, COMPANY_FORM);
    const first = panel && $('input:not([type="hidden"]):not([readonly]):not([disabled]),select:not([disabled])', panel);
    if (first) requestAnimationFrame(() => first.focus());
  }
}
function companyDocProgress() {
  let done = 0;
  for (const def of DOC_DEFS) {
    const box = docInput(def.k);
    if (!box) continue;
    const hasValue = box.type === 'checkbox' ? box.checked : !!box.value.trim();
    if (hasValue) done++;
  }
  return { done, total: DOC_DEFS.length };
}
function updateCompanyFormProgress() {
  const requiredIds = ['newStatus', 'newCompanyName'];
  const requiredDone = requiredIds.filter(fieldHasValue).length;
  const optionalMissing = OPTIONAL_COMPANY_FIELDS.filter(id => !fieldHasValue(id)).length;
  const scheduleDone = ['newConsult1Date', 'newConsult2Date'].filter(fieldHasValue).length;
  const docs = companyDocProgress();
  $('#companyBasicCount').textContent = `필수 ${requiredDone}/${requiredIds.length}`;
  $('#companyScheduleCount').textContent = `${scheduleDone}/2`;
  $('#companyDocsCount').textContent = `${docs.done}/${docs.total}`;
  const basicTab = $('#companyTabBasic');
  const scheduleTab = $('#companyTabSchedule');
  const docsTab = $('#companyTabDocs');
  basicTab.classList.toggle('is-required-missing', requiredDone < requiredIds.length);
  scheduleTab.classList.toggle('is-incomplete', scheduleDone < 2);
  docsTab.classList.toggle('is-incomplete', docs.done < docs.total);
  const progress = $('#companyProgress');
  progress.classList.toggle('required-missing', requiredDone < requiredIds.length);
  progress.innerHTML = `<strong>필수 ${requiredDone}/${requiredIds.length}</strong><span class="sep" aria-hidden="true"></span><span>선택 ${optionalMissing}개 비어 있음</span>`;
  $('#companySave').disabled = companySaving || requiredDone < requiredIds.length;
}
function populateCompanyChoices() {
  const owners = uniq(state.M.companies.map(c => c.owner).concat(state.M.coaches.map(c => c.owner)));
  const ownerOptions = owners.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
  $('#newOwner').innerHTML = '<option value="">미배정</option>' + ownerOptions;
  for (const id of ['#newConsult1Owner', '#newConsult2Owner']) {
    $(id).innerHTML = '<option value="">선택하세요</option>' + ownerOptions;
  }
  const coaches = [...state.M.coaches].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  $('#newCoach').innerHTML = '<option value="">미배정</option>' +
    coaches.map(coach => `<option value="${esc(coach.name)}">${esc(coach.name)}</option>`).join('');
}
function syncVisitControls(index, markEdited) {
  const checked = $(`#newConsult${index}Visit`).checked;
  const owner = $(`#newConsult${index}Owner`);
  const hint = $(`#newConsult${index}OwnerHint`);
  owner.disabled = !checked;
  if (checked && !owner.value && $('#newOwner').value) owner.value = $('#newOwner').value;
  hint.textContent = checked ? '동행할 내부 담당자를 선택하세요.' : '동행 체크 시 선택할 수 있습니다.';
  hint.classList.toggle('ready', checked);
  if (markEdited) companyScheduleEdited = true;
  updateCompanyFormProgress();
}
function fillConsultationFields(company) {
  const year = getBaseYear();
  const items = company ? company.consultations : [{}, {}];
  items.forEach((item, i) => {
    const index = i + 1;
    const fallback = i === 0 && company ? company.start : null;
    const rawDate = item.date || fallback;
    $(`#newConsult${index}Date`).value = rawDate ? mdWithYear(rawDate, year) : (item.dateRaw || '');
    $(`#newConsult${index}Time`).value = item.time || '';
    $(`#newConsult${index}Visit`).checked = !!item.visit;
    $(`#newConsult${index}Owner`).value = item.owner || '';
    syncVisitControls(index, false);
  });
  const note = $('#legacyVisitNote');
  const latest = company && company.latestVisit;
  if (latest && (latest.owner || latest.dateRaw || latest.time)) {
    note.textContent = `현재 시트 최근 방문: ${latest.date ? korDate(latest.date) : (latest.dateRaw || '일자 미정')} ${latest.time || ''} · ${latest.owner || '담당자 미정'}`;
    note.classList.add('show');
  } else {
    note.textContent = '';
    note.classList.remove('show');
  }
  companyScheduleEdited = false;
}
function consultationFormValues(year) {
  return [1, 2].map(index => {
    const date = monthDayToDate($(`#newConsult${index}Date`).value, year);
    const visit = $(`#newConsult${index}Visit`).checked;
    return {
      index,
      date,
      dateText: $(`#newConsult${index}Date`).value.trim(),
      time: $(`#newConsult${index}Time`).value,
      visit,
      owner: visit ? $(`#newConsult${index}Owner`).value : '',
    };
  });
}
const docFieldId = def => 'newDoc_' + def.k;
const docInput = k => $('#' + docFieldId(byDocKey(k)));

/** 서류 탭 15개 열을 단계별 입력 칸으로 — DOC_DEFS가 유일한 기준이라 열이 바뀌면 폼도 같이 따라간다 */
function buildCompanyDocFields() {
  $('#companyDocFields').innerHTML = STAGES.map(stage => {
    const fields = DOC_DEFS.filter(d => d.stage === stage).map(docFieldHtml).join('');
    return `<div class="doc-stage"><h4>${esc(stage)}</h4><div class="company-fields">${fields}</div></div>`;
  }).join('');
  docInput('teamStart').oninput = syncTeamEnd;   // 종료일은 시작일에 붙어 따라온다
}
function docFieldHtml(d) {
  const id = docFieldId(d);
  const locked = docLocked(d) || d.type === 'auto';
  if (d.type === 'mark' && !locked) {
    return `<div class="company-field check">
      <input type="checkbox" id="${id}">
      <label for="${id}">${esc(d.label)}</label>
    </div>`;
  }
  const note = d.byCoach ? '코치 공통 · 서류현황에서 수정'
    : d.type === 'auto' ? '시작일 +28일 자동'
    : d.type === 'range' ? '월/일 ~ 12/31'
    : '월/일';
  const box = `<input type="text" id="${id}" inputmode="numeric" autocomplete="off"
    placeholder="${locked ? '자동 입력' : '예: 6/22'}"${locked ? ' readonly tabindex="-1"' : ''}>`;
  return `<div class="company-field">
    <label for="${id}">${esc(d.label)}<span class="auto">${note}</span></label>
    ${d.type === 'range' ? `<div class="md-range">${box}<span class="md-suffix">~ 12/31</span></div>` : box}
  </div>`;
}

/** 약정 종료일 = 약정 시작일 + 28일. 사람이 고칠 수 없는 계산값이라 dataset에 실제 날짜를 남긴다 */
function syncTeamEnd() {
  const year = getBaseYear();
  const start = monthDayToDate(docInput('teamStart').value, year);
  const end = start ? addDays(start, 28) : null;
  const box = docInput('teamEnd');
  box.value = mdWithYear(end, year);
  box.dataset.iso = end ? iso(end) : '';
}

function updateCoachContact(options = {}) {
  const coach = state.M.coaches.find(c => c.name === $('#newCoach').value);
  const override = $('#coachContactOverride');
  if (options.resetOverride) override.checked = false;
  if (!override.checked || options.useMaster) {
    $('#newCoachEmail').value = coach ? coach.email : '';
    $('#newCoachPhone').value = coach ? coach.phone : '';
  }
  $('#newCoachEmail').readOnly = !override.checked;
  $('#newCoachPhone').readOnly = !override.checked;
  override.disabled = !coach && !override.checked;
  $('#coachContactHelp').textContent = override.checked
    ? '이 기업에만 별도 연락처를 저장합니다. 코치 기본 정보는 바뀌지 않습니다.'
    : coach
      ? '훈련코치 탭의 연락처를 사용합니다. 기본 정보 변경은 훈련코치 탭에서 수정하세요.'
      : '훈련코치를 선택하면 코치 탭의 연락처가 자동 입력됩니다.';
  // 동의서 3종·통장사본은 코치 공통값 — 기업 기본정보 폼에서는 현재 상태만 보여준다
  const year = getBaseYear();
  for (const d of DOC_DEFS) {
    if (!d.byCoach) continue;
    const raw = coach ? coach[d.byCoach] : '';
    const box = docInput(d.k);
    if (d.type === 'mark') { box.value = filled(raw) ? 'O' : ''; box.dataset.iso = ''; continue; }
    const date = toDate(raw);
    box.value = mdWithYear(date, year);
    box.dataset.iso = date ? iso(date) : '';
  }
  updateCompanyFormProgress();
}

function setCompanyDialogMode(editing) {
  $('#companyDialogEyebrow').textContent = editing ? 'EDIT COMPANY' : 'NEW COMPANY';
  $('#companyDialogTitle').textContent = editing ? '기업 정보 수정' : '기업 추가';
  $('#companyDialogSub').textContent = editing
    ? '변경한 내용을 Google Sheet와 대시보드에 함께 반영합니다.'
    : '등록하면 Google Sheet와 대시보드에 함께 반영됩니다.';
  $('#companySave').textContent = editing ? '변경사항 저장' : 'Google Sheet에 저장';
}

function fillCompanyDocFields(company) {
  for (const d of DOC_DEFS) {
    const box = docInput(d.k);
    const raw = company.docs[d.k];
    if (d.type === 'mark') {
      if (box.type === 'checkbox') box.checked = filled(raw);
      else box.value = filled(raw) ? 'O' : '';
      continue;
    }
    box.value = docCellText(raw);
    if (box.readOnly) {
      const date = toDate(raw);
      box.dataset.iso = date ? iso(date) : '';
    }
  }
}

function openCompanyDialog() {
  companyReturnFocus = document.activeElement;
  companyEditTarget = null;
  setCompanyDialogMode(false);
  COMPANY_FORM.reset();
  populateCompanyChoices();
  $('#newStatus').value = '검토요청';
  fillConsultationFields(null);
  $('#coachContactOverride').checked = false;
  $('#companyDocs').open = true;
  COMPANY_FORM.querySelectorAll('.bad').forEach(box => box.classList.remove('bad'));
  updateCoachContact({ useMaster: true });
  syncTeamEnd();
  setCompanyFormStep('basic');
  updateCompanyFormProgress();
  setCompanyState(`${getBaseYear()}년 기준 · 날짜는 6/22 처럼 월/일만 적으면 됩니다.`, 'ok');
  COMPANY_DIALOG.classList.add('open');
  COMPANY_DIALOG.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => $('#newCompanyName').focus());
}

function openCompanyEditDialog(company) {
  companyReturnFocus = document.activeElement;
  companyEditTarget = company;
  setCompanyDialogMode(true);
  COMPANY_FORM.reset();
  populateCompanyChoices();
  $('#newStatus').value = company.status;
  $('#newOwner').value = company.owner;
  $('#newCoach').value = company.coachName;
  $('#newCompanyName').value = company.name;
  $('#newContactName').value = company.contact.name;
  $('#newContactTitle').value = company.contact.title;
  $('#newContactPhone').value = company.contact.phone;
  $('#newContactEmail').value = company.contact.email;
  const workplace = company.workplace || {};
  $('#newEmployeeCount').value = workplace.employeeCount || '';
  $('#newWorkplaceNumber').value = workplace.managementNumber || '';
  $('#newCompanyAddress').value = workplace.address || '';
  $('#newAgencyBranch').value = workplace.agencyBranch || '';
  $('#newHrd4uId').value = workplace.hrd4uId || '';
  fillConsultationFields(company);
  fillCompanyDocFields(company);
  const coach = state.M.coaches.find(c => c.name === company.coachName);
  const masterEmail = coach ? String(coach.email || '').trim() : '';
  const masterPhone = coach ? String(coach.phone || '').trim() : '';
  const savedEmail = String(company.coachEmail || '').trim();
  const savedPhone = String(company.coachPhone || '').trim();
  const contactDiffers = !!(savedEmail || savedPhone) && (savedEmail !== masterEmail || savedPhone !== masterPhone);
  $('#coachContactOverride').checked = contactDiffers;
  $('#newCoachEmail').value = contactDiffers ? savedEmail : masterEmail;
  $('#newCoachPhone').value = contactDiffers ? savedPhone : masterPhone;
  updateCoachContact({ useMaster: !contactDiffers });
  syncTeamEnd();
  $('#companyDocs').open = true;
  setCompanyFormStep('basic');
  updateCompanyFormProgress();
  COMPANY_FORM.querySelectorAll('.bad').forEach(box => box.classList.remove('bad'));
  setCompanyState(`${company.name} 정보를 수정합니다. 날짜는 6/22처럼 월/일로 입력하세요.`, 'ok');
  COMPANY_DIALOG.classList.add('open');
  COMPANY_DIALOG.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => $('#newStatus').focus());
}
function closeCompanyDialog() {
  const wasOpen = COMPANY_DIALOG.classList.contains('open');
  COMPANY_DIALOG.classList.remove('open');
  COMPANY_DIALOG.setAttribute('aria-hidden', 'true');
  if (wasOpen && companyReturnFocus && document.contains(companyReturnFocus)) companyReturnFocus.focus();
}
/** 서류 입력 칸 → { 컬럼키: 값 }. 날짜는 yyyy-mm-dd, O 표시는 'O', 약정기간은 '시작 ~ 12/31' */
function collectDocValues() {
  const year = getBaseYear();
  const yearEnd = new Date(year, 11, 31);
  const out = {};
  for (const d of DOC_DEFS) {
    if (docLocked(d)) continue;                 // 수식이 채우는 열은 보내지 않는다
    const box = docInput(d.k);
    if (d.type === 'mark') { out[d.k] = box.checked ? 'O' : ''; continue; }
    if (box.dataset.iso !== undefined && box.readOnly) { out[d.k] = box.dataset.iso; continue; }
    const date = monthDayToDate(box.value, year);
    out[d.k] = !date ? ''
      : d.type === 'range' ? `${iso(date)} ~ ${iso(yearEnd)}`
      : iso(date);
  }
  return out;
}

/**
 * 서류 날짜 검사 — 형식이 먼저, 그 다음 순서.
 * 컨설팅 신청서 ≤ 표준 협약서 ≤ 약정서 작성일 ≤ 약정기간 ≤ 약정 시작일
 */
function validateDocDates(year) {
  for (const d of DOC_DEFS) {
    if (d.type !== 'date' && d.type !== 'range') continue;
    if (d.byCoach) continue;
    const box = docInput(d.k);
    if (box.value.trim() && !monthDayToDate(box.value, year)) {
      return { box, message: `${d.label} — 6/22 처럼 월/일로 적어주세요.` };
    }
  }
  let prev = null;
  for (const d of DOC_DEFS.filter(x => x.order).sort((a, b) => a.order - b.order)) {
    const box = docInput(d.k);
    const date = monthDayToDate(box.value, year);
    if (!date) continue;                       // 비워둔 항목은 순서 검사에서 건너뛴다
    if (prev && date < prev.date) {
      return { box, message: `${d.label}(${md(date)})은 ${prev.label}(${md(prev.date)})보다 빠를 수 없습니다.` };
    }
    prev = { date, label: d.label };
  }
  return null;
}
/** 문제가 된 칸을 붉게 표시하고 포커스 — 다시 입력하면 표시가 풀린다 */
function markBadField(box) {
  box.classList.add('bad');
  box.focus();
  box.addEventListener('input', () => box.classList.remove('bad'), { once: true });
}
function setCompanyBusy(busy) {
  companySaving = busy;
  const save = $('#companySave');
  save.textContent = busy
    ? (companyEditTarget ? '변경사항 저장 중…' : '시트에 저장 중…')
    : (companyEditTarget ? '변경사항 저장' : 'Google Sheet에 저장');
  $('#companyCancel').disabled = busy;
  updateCompanyFormProgress();
}
async function saveCompany() {
  if (!COMPANY_FORM.checkValidity()) {
    const invalid = COMPANY_FORM.querySelector(':invalid');
    const panel = invalid && invalid.closest('[data-company-step-panel]');
    setCompanyFormStep(panel ? panel.dataset.companyStepPanel : 'basic');
    requestAnimationFrame(() => invalid ? invalid.reportValidity() : COMPANY_FORM.reportValidity());
    return;
  }
  const companyName = $('#newCompanyName').value.trim();
  if (state.M.companies.some(c => c !== companyEditTarget && c.name.trim() === companyName)) {
    setCompanyState('같은 기업명이 이미 등록되어 있습니다. 기업명을 확인하세요.', 'bad');
    setCompanyFormStep('basic');
    $('#newCompanyName').focus();
    return;
  }
  const year = getBaseYear();
  const consultations = consultationFormValues(year);
  for (const item of consultations) {
    const dateBox = $(`#newConsult${item.index}Date`);
    if (item.dateText && !item.date) {
      setCompanyState(`${item.index}차 컨설팅일 — 6/22 처럼 월/일로 적어주세요.`, 'bad');
      setCompanyFormStep('schedule');
      markBadField(dateBox);
      return;
    }
    if (item.time && !item.date) {
      setCompanyState(`${item.index}차 컨설팅 시간을 입력하려면 날짜도 선택해주세요.`, 'bad');
      setCompanyFormStep('schedule');
      markBadField(dateBox);
      return;
    }
    if (item.visit && !item.date) {
      setCompanyState(`${item.index}차 동행을 체크하려면 컨설팅일을 입력해주세요.`, 'bad');
      setCompanyFormStep('schedule');
      markBadField(dateBox);
      return;
    }
    if (item.visit && !item.owner) {
      const ownerBox = $(`#newConsult${item.index}Owner`);
      setCompanyState(`${item.index}차 동행 담당자를 선택해주세요.`, 'bad');
      setCompanyFormStep('schedule');
      markBadField(ownerBox);
      return;
    }
  }
  if (consultations[0].date && consultations[1].date && consultations[1].date < consultations[0].date) {
    setCompanyState('2차 컨설팅일은 1차 컨설팅일보다 빠를 수 없습니다.', 'bad');
    setCompanyFormStep('schedule');
    markBadField($('#newConsult2Date'));
    return;
  }
  const docProblem = validateDocDates(year);
  if (docProblem) {
    setCompanyFormStep('docs');
    $('#companyDocs').open = true;
    setCompanyState(docProblem.message, 'bad');
    markBadField(docProblem.box);
    return;
  }
  const firstDate = consultations[0].date;
  const startDate = firstDate ? iso(firstDate) : '';
  const endDate = firstDate ? iso(addDays(firstDate, 28)) : '';
  const endpoint = writeEndpoint();
  const payload = {
    originalCompanyName: companyEditTarget ? companyEditTarget.name : '',
    status: $('#newStatus').value,
    owner: $('#newOwner').value,
    companyName,
    contactName: $('#newContactName').value.trim(),
    contactTitle: $('#newContactTitle').value.trim(),
    contactPhone: $('#newContactPhone').value.trim(),
    contactEmail: $('#newContactEmail').value.trim(),
    employeeCount: $('#newEmployeeCount').value.trim(),
    workplaceNumber: $('#newWorkplaceNumber').value.trim(),
    companyAddress: $('#newCompanyAddress').value.trim(),
    agencyBranch: $('#newAgencyBranch').value.trim(),
    hrd4uId: $('#newHrd4uId').value.trim(),
    startDate,
    endDate,
    coachName: $('#newCoach').value,
    coachEmail: $('#newCoachEmail').value.trim(),
    coachPhone: $('#newCoachPhone').value.trim(),
    scheduleChanged: !companyEditTarget || companyScheduleEdited,
    consult1Date: iso(consultations[0].date),
    consult1Time: consultations[0].time,
    consult1Visit: consultations[0].visit ? 'O' : '',
    consult1Owner: consultations[0].owner,
    consult2Date: iso(consultations[1].date),
    consult2Time: consultations[1].time,
    consult2Visit: consultations[1].visit ? 'O' : '',
    consult2Owner: consultations[1].owner,
    docs: collectDocValues(),
  };
  setCompanyBusy(true);
  setCompanyState(`${companyName} 정보를 Google Sheet에 ${companyEditTarget ? '반영' : '저장'}하고 있습니다…`, '');
  try {
    const wasEditing = !!companyEditTarget;
    const oldName = companyEditTarget ? companyEditTarget.name : '';
    await requestSheetWrite(endpoint, wasEditing ? 'updateCompany' : 'addCompany', payload);
    if (wasEditing && oldName !== companyName && twoWeekExtensions[oldName]) {
      twoWeekExtensions[companyName] = true;
      delete twoWeekExtensions[oldName];
      try { localStorage.setItem(EXTENSION_KEY, JSON.stringify(twoWeekExtensions)); } catch {}
    }
    closeCompanyDialog();
    const synced = await syncFromSheet(localStorage.getItem(SHEET_ENDPOINT_KEY) || DEFAULT_SHEET_URL, { silent: true });
    if (synced) {
      go('comp', { q: companyName, status: '', owner: '', coach: '' });
      toast(`${companyName} ${wasEditing ? '수정' : '등록'} 완료`);
    } else {
      toast(`시트 ${wasEditing ? '수정' : '저장'} 완료 — 잠시 후 동기화 버튼을 눌러주세요.`);
    }
  } catch (e) {
    console.error(e);
    setCompanyState('저장 실패 — ' + (e.message || '저장 연결을 확인하세요.'), 'bad');
  } finally {
    setCompanyBusy(false);
  }
}
