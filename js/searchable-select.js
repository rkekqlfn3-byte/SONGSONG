/* ============================================================
   검색 가능한 선택창
   - 기존 <select>를 데이터 원본으로 그대로 유지한다.
   - 화면에는 검색 입력 + 키보드로 고를 수 있는 목록을 보여준다.
   ============================================================ */
(function searchableSelectModule() {
  let optionId = 0;

  const searchText = value => String(value || '')
    .normalize('NFC')
    .toLocaleLowerCase('ko-KR')
    .replace(/\s+/g, '');

  const selectLabel = select => {
    if (select.id) {
      const label = document.querySelector(`label[for="${select.id}"]`);
      if (label) return label.textContent.replace('*', '').trim();
    }
    const fieldLabel = select.closest('.field,.company-field')?.querySelector('label');
    return fieldLabel ? fieldLabel.textContent.replace('*', '').trim() : '목록';
  };

  const selectOptions = select => [...select.options].map(option => ({
    value: option.value,
    text: option.textContent.trim(),
    disabled: option.disabled,
  }));

  function enhanceSearchableSelect(select) {
    if (!select || select.dataset.searchable === 'off') return null;
    if (select._searchableSelect) {
      select._searchableSelect.sync();
      return select._searchableSelect;
    }

    const host = document.createElement('div');
    host.className = 'searchable-select';
    const input = document.createElement('input');
    const panel = document.createElement('div');
    const listId = `searchableSelectList${++optionId}`;
    const label = selectLabel(select);

    input.type = 'text';
    input.className = 'searchable-select-input';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', listId);
    input.setAttribute('aria-label', `${label} 검색 및 선택`);

    panel.id = listId;
    panel.className = 'searchable-select-panel';
    panel.setAttribute('role', 'listbox');
    panel.setAttribute('aria-label', `${label} 목록`);
    panel.hidden = true;

    select.parentNode.insertBefore(host, select);
    host.append(input, panel, select);
    select.classList.add('searchable-select-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    let open = false;
    let matches = [];
    let activeIndex = -1;

    const selectedText = () => {
      const selected = select.options[select.selectedIndex];
      return selected ? selected.textContent.trim() : '';
    };

    const setActive = next => {
      if (!matches.length) {
        activeIndex = -1;
        input.removeAttribute('aria-activedescendant');
        return;
      }
      activeIndex = (next + matches.length) % matches.length;
      panel.querySelectorAll('[role="option"]').forEach((button, index) => {
        const active = index === activeIndex;
        button.classList.toggle('active', active);
        if (active) {
          input.setAttribute('aria-activedescendant', button.id);
          button.scrollIntoView({ block: 'nearest' });
        }
      });
    };

    const choose = value => {
      select.value = value;
      api.sync();
      api.close();
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const renderOptions = query => {
      const key = searchText(query);
      matches = selectOptions(select).filter(option =>
        !option.disabled && (!key || searchText(`${option.text} ${option.value}`).includes(key))
      );
      panel.innerHTML = '';
      if (!matches.length) {
        const empty = document.createElement('div');
        empty.className = 'searchable-select-empty';
        empty.textContent = '검색 결과가 없습니다.';
        panel.appendChild(empty);
        setActive(-1);
        return;
      }

      matches.forEach((option, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = `${listId}Option${index}`;
        button.className = 'searchable-select-option';
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', option.value === select.value ? 'true' : 'false');
        button.dataset.value = option.value;
        button.textContent = option.text;
        button.onmousedown = event => event.preventDefault();
        button.onclick = () => choose(option.value);
        panel.appendChild(button);
      });

      const selectedIndex = matches.findIndex(option => option.value === select.value);
      setActive(selectedIndex >= 0 ? selectedIndex : 0);
    };

    const api = {
      open() {
        if (select.disabled || open) return;
        document.querySelectorAll('.searchable-select.open').forEach(other => {
          if (other !== host && other._searchableSelect) other._searchableSelect.close();
        });
        open = true;
        const rect = host.getBoundingClientRect();
        host.classList.add('open');
        host.classList.toggle('drop-up', innerHeight - rect.bottom < 260 && rect.top > 260);
        host.classList.toggle('align-end', rect.left + Math.max(rect.width, 320) > innerWidth - 12);
        input.value = '';
        input.placeholder = selectedText() || `${label} 검색`;
        input.setAttribute('aria-expanded', 'true');
        panel.hidden = false;
        renderOptions('');
      },
      close() {
        if (!open) return;
        open = false;
        host.classList.remove('open', 'drop-up', 'align-end');
        panel.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        api.sync();
      },
      sync() {
        input.disabled = select.disabled;
        input.value = selectedText();
        input.placeholder = `${label} 검색`;
        host.classList.toggle('disabled', select.disabled);
        if (select.disabled && open) api.close();
      },
    };

    select._searchableSelect = api;
    host._searchableSelect = api;
    api.sync();

    input.onfocus = () => api.open();
    input.onclick = () => api.open();
    input.oninput = () => {
      if (!open) api.open();
      renderOptions(input.value);
    };
    input.onkeydown = event => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!open) api.open();
        setActive(activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (event.key === 'Enter' && open) {
        event.preventDefault();
        if (activeIndex >= 0) choose(matches[activeIndex].value);
      } else if (event.key === 'Escape' && open) {
        event.preventDefault();
        api.close();
        input.select();
      } else if (event.key === 'Home' && open) {
        event.preventDefault();
        setActive(0);
      } else if (event.key === 'End' && open) {
        event.preventDefault();
        setActive(matches.length - 1);
      } else if (event.key === 'Tab') {
        api.close();
      }
    };
    input.onblur = () => setTimeout(() => {
      if (!host.contains(document.activeElement)) api.close();
    }, 0);
    select.onfocus = () => input.focus();

    if (select.id) {
      const linkedLabel = document.querySelector(`label[for="${select.id}"]`);
      if (linkedLabel) linkedLabel.addEventListener('click', event => {
        event.preventDefault();
        input.focus();
      });
    }
    return api;
  }

  function selectElements(root) {
    if (!root) return [];
    return root.matches && root.matches('select') ? [root] : [...root.querySelectorAll('select')];
  }

  window.enhanceSearchableSelects = function enhanceSearchableSelects(root) {
    selectElements(root || document).forEach(enhanceSearchableSelect);
  };

  window.syncSearchableSelects = function syncSearchableSelects(root) {
    selectElements(root || document).forEach(select => {
      if (select._searchableSelect) select._searchableSelect.sync();
      else enhanceSearchableSelect(select);
    });
  };

  document.addEventListener('pointerdown', event => {
    document.querySelectorAll('.searchable-select.open').forEach(host => {
      if (!host.contains(event.target) && host._searchableSelect) host._searchableSelect.close();
    });
  });

  const observer = new MutationObserver(records => {
    records.forEach(record => {
      if (record.type === 'attributes' && record.target.matches('select')) {
        window.syncSearchableSelects(record.target);
        return;
      }
      const select = record.target.closest && record.target.closest('select');
      if (select) window.syncSearchableSelects(select);
      record.addedNodes.forEach(node => {
        if (node.nodeType === 1) window.enhanceSearchableSelects(node);
      });
    });
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled'],
  });

  window.enhanceSearchableSelects(document);
})();
