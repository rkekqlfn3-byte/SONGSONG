/* ============================================================
   14. 부팅
   ============================================================ */
(function boot() {
  // 테마
  const savedTheme = localStorage.getItem(LS_KEY + ':theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  $('#btnTheme').onclick = () => {
    const cur = document.documentElement.dataset.theme;
    const isDark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches;
    const next = isDark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(LS_KEY + ':theme', next);
  };

  // 데이터: 저장본 우선, 실패하면 내장 스냅샷
  let loaded = false;
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) { applyData(JSON.parse(saved), '저장된 최근 데이터', false); loaded = true; }
  } catch (e) { console.warn('저장된 데이터를 읽지 못했습니다', e); }
  if (!loaded) applyData(EMBEDDED, '내장 스냅샷', false);

  // 탭
  $('#tabs').onclick = e => { const b = e.target.closest('.tab'); if (b) go(b.dataset.tab); };

  // Google Sheet 동기화 / 연결 설정
  $('#btnUpdate').onclick = () => {
    const endpoint = localStorage.getItem(SHEET_ENDPOINT_KEY) || DEFAULT_SHEET_URL;
    syncFromSheet(endpoint, { saveEndpoint: true });
  };
  $('#btnSheetSettings').onclick = openSyncDialog;
  $('#syncClose').onclick = closeSyncDialog;
  SYNC_DIALOG.onclick = e => { if (e.target === SYNC_DIALOG) closeSyncDialog(); };
  $('#syncTest').onclick = async () => {
    const readOk = await syncFromSheet(SYNC_ENDPOINT.value, { inDialog: true, testOnly: true });
    if (!readOk || !SYNC_WRITE_ENDPOINT.value.trim()) return;
    try {
      await requestSheetWrite(SYNC_WRITE_ENDPOINT.value, 'ping', {});
      setSyncState('연결 성공 — 시트 읽기와 기업 저장 연결이 모두 정상입니다.', 'ok');
    } catch (e) {
      setSyncState('읽기 연결은 정상입니다. 저장 연결 실패 — ' + e.message, 'bad');
    }
  };
  $('#syncSave').onclick = async () => {
    const writeRaw = SYNC_WRITE_ENDPOINT.value.trim();
    if (writeRaw) {
      try { localStorage.setItem(WRITE_ENDPOINT_KEY, normalizeWriteEndpoint(writeRaw)); }
      catch (e) { setSyncState(e.message, 'bad'); return; }
    }
    const ok = await syncFromSheet(SYNC_ENDPOINT.value, { inDialog: true, saveEndpoint: true });
    if (ok) closeSyncDialog();
  };
  $('#syncDefault').onclick = () => {
    SYNC_ENDPOINT.value = DEFAULT_SHEET_URL;
    setSyncState('요청하신 Google Sheet 주소를 입력했습니다.', 'ok');
  };
  SYNC_ENDPOINT.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); $('#syncSave').click(); }
  };
  SYNC_WRITE_ENDPOINT.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); $('#syncSave').click(); }
  };

  // 기준 연도 — 한 번 정하면 계속 유지되고, 월/일 입력이 이 연도로 해석된다
  const yearBox = $('#baseYear');
  yearBox.value = getBaseYear();
  yearBox.onchange = () => {
    const picked = parseInt(yearBox.value, 10);
    if (!(picked >= 2000 && picked <= 2100)) { yearBox.value = getBaseYear(); return; }
    setBaseYear(picked);
    updateCoachContact();
    syncTeamEnd();
    toast(`기준 연도 ${picked}년`);
  };

  // 기업 추가
  buildCompanyDocFields();
  $('#btnAddCompany').onclick = openCompanyDialog;
  // 인자를 넘기지 않아야 «입력 중이면 확인» 이 걸린다 (클릭 이벤트를 그대로 넘기면 안 된다)
  $('#companyClose').onclick = () => closeCompanyDialog();
  $('#companyCancel').onclick = () => closeCompanyDialog();
  $('#companyOpenSettings').onclick = openSyncDialog;
  $('#companyFormTabs').onclick = event => {
    const button = event.target.closest('[data-company-step]');
    if (button) setCompanyFormStep(button.dataset.companyStep, true);
  };
  $('#companyFormTabs').onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = COMPANY_STEPS.indexOf(document.activeElement.dataset.companyStep);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? COMPANY_STEPS.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + COMPANY_STEPS.length) % COMPANY_STEPS.length;
    setCompanyFormStep(COMPANY_STEPS[next]);
    $(`[data-company-step="${COMPANY_STEPS[next]}"]`, COMPANY_FORM).focus();
  };
  $('#newCoach').onchange = () => updateCoachContact({ resetOverride: true, useMaster: true });
  $('#newCompanyAddress').addEventListener('input', queueAgencyBranchSuggestion);
  $('#newCompanyAddress').addEventListener('blur', () => applyAgencyBranchSuggestion(false));
  $('#newAgencyBranch').addEventListener('change', markAgencyBranchManual);
  $('#agencyBranchSuggest').onclick = () => applyAgencyBranchSuggestion(true);
  $('#coachContactOverride').onchange = () => {
    updateCoachContact({ useMaster: !$('#coachContactOverride').checked });
    if ($('#coachContactOverride').checked) $('#newCoachEmail').focus();
  };
  [1, 2].forEach(index => {
    $(`#newConsult${index}Date`).oninput = () => { companyScheduleEdited = true; };
    $(`#newConsult${index}Time`).oninput = () => { companyScheduleEdited = true; };
    $(`#newConsult${index}Visit`).onchange = () => syncVisitControls(index, true);
    $(`#newConsult${index}Owner`).onchange = () => { companyScheduleEdited = true; };
  });
  COMPANY_FORM.addEventListener('input', updateCompanyFormProgress);
  COMPANY_FORM.addEventListener('change', updateCompanyFormProgress);
  COMPANY_DIALOG.onclick = e => { if (e.target === COMPANY_DIALOG) closeCompanyDialog(); };
  COMPANY_FORM.onsubmit = e => { e.preventDefault(); saveCompany(); };

  // Excel 파일 선택 / 드래그앤드롭 — 비상용 수동 갱신
  const pick = $('#filePick');
  $('#btnFile').onclick = () => pick.click();
  pick.onchange = () => { loadFile(pick.files[0]); pick.value = ''; };
  const dz = $('#drop');
  let depth = 0;
  addEventListener('dragenter', e => { if (![...e.dataTransfer.types].includes('Files')) return; depth++; dz.classList.add('on'); });
  addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; dz.classList.remove('on'); } });
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => { e.preventDefault(); depth = 0; dz.classList.remove('on'); loadFile(e.dataTransfer.files[0]); });

  // 복사 버튼 위임
  addEventListener('click', e => {
    const b = e.target.closest('[data-copy]');
    if (b) { e.preventDefault(); copy(b.dataset.copy, b.dataset.label || '값'); }
  });

  // 툴팁
  const tip = $('#tip');
  addEventListener('mouseover', e => {
    const t = e.target.closest('[data-tip]');
    if (!t) { tip.style.opacity = 0; return; }
    tip.textContent = t.dataset.tip;
    tip.style.opacity = 1;
    const r = t.getBoundingClientRect();
    const x = Math.min(Math.max(8, r.left), innerWidth - tip.offsetWidth - 8);
    const above = r.top > tip.offsetHeight + 12;
    tip.style.left = x + 'px';
    tip.style.top = (above ? r.top - tip.offsetHeight - 8 : r.bottom + 8) + 'px';
  });
  addEventListener('mouseout', e => { if (e.target.closest('[data-tip]')) tip.style.opacity = 0; });
  DRAWER_BACKDROP.onclick = closeDrawer;
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (SYNC_DIALOG.classList.contains('open')) closeSyncDialog();
    else if (COMPANY_DIALOG.classList.contains('open')) closeCompanyDialog();
    else closeDrawer();
  });

  // 연결된 주소가 있으면 저장 데이터를 먼저 보여준 뒤 백그라운드에서 최신화
  const endpoint = localStorage.getItem(SHEET_ENDPOINT_KEY) || DEFAULT_SHEET_URL;
  syncFromSheet(endpoint, { silent: true, saveEndpoint: true });
})();
