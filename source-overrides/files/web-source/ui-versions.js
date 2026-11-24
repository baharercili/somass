/* Named design versions: presentation only; all plan/storage work belongs to the engine. */
(function (g) {
  'use strict';
  if (!g.document || document.getElementById('designVersionsDialog')) return;
  const api = g.SOMASS_VERSIONS;
  if (!api || typeof api.getState !== 'function') return;
  const d = document, cards = new Map();
  let busy = false, scheduled = false, cardOrder = '';
  const node = (tag, className, text) => {
    const el = d.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const setText = (el, value) => { const text = String(value ?? ''); if (el.textContent !== text) el.textContent = text; };
  const button = (id, text, className = '') => {
    const el = node('button', 'versions-button ' + className, text);
    if (id) el.id = id;
    el.type = 'button';
    return el;
  };
  const input = (id, value, label) => {
    const wrap = node('label', 'versions-field'), caption = node('span', '', label), el = node('input');
    el.id = id; el.type = 'text'; el.maxLength = 80; el.required = true;
    el.value = value; el.autocomplete = 'off';
    wrap.htmlFor = id; wrap.append(caption, el);
    return { wrap, el };
  };
  const messageText = value => typeof value === 'string' ? value : value?.message || '';
  function dateText(value) {
    const time = new Date(value);
    if (!Number.isFinite(time.getTime())) return '';
    return new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul'
    }).format(time);
  }
  function backupStamp() {
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = type => parts.find(value => value.type === type)?.value || '';
    return part('year') + '-' + part('month') + '-' + part('day');
  }
  function countText(value) { const n = Number(value); return String(Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0); }

  const open = button('projectVersionsOpen', 'Sürümler');
  open.className = 'button secondary versions-open';
  open.setAttribute('aria-haspopup', 'dialog'); open.setAttribute('aria-controls', 'designVersionsDialog');
  const icon = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
  const outline = d.createElementNS('http://www.w3.org/2000/svg', 'path');
  outline.setAttribute('d', 'M7 3h12v14H7zM3 7v14h12'); icon.append(outline); open.prepend(icon);
  const header = d.querySelector('.header-actions');
  if (!header) return;
  header.insertBefore(open, d.getElementById('projectSave') || header.firstChild);
  d.body.classList.add('versions-enabled');

  const badge = node('span', 'versions-active-badge'); badge.id = 'activeDesignVersion'; badge.hidden = true;
  badge.setAttribute('role', 'status'); badge.setAttribute('aria-live', 'polite');
  (d.querySelector('.project-title') || header).append(badge);
  const mobileBadge = node('span', 'versions-mobile-active'); mobileBadge.id = 'versionsMobileActive'; mobileBadge.hidden = true;
  mobileBadge.setAttribute('role', 'status'); mobileBadge.setAttribute('aria-live', 'polite');
  d.querySelector('.drawing-top')?.append(mobileBadge);

  const dialog = node('dialog', 'design-versions-dialog'); dialog.id = 'designVersionsDialog';
  dialog.setAttribute('aria-labelledby', 'versionsTitle');
  const heading = node('header', 'versions-heading'), headingText = node('div');
  headingText.append(node('small', 'versions-eyebrow', 'TASARIM ÇALIŞMALARI'));
  const title = node('h2', '', 'Tasarım sürümleri'); title.id = 'versionsTitle'; title.tabIndex = -1;
  headingText.append(title, node('p', '', 'Mevcut tasarımını sakla, yeni bir kopyada ayrı devam et.'));
  const close = button('versionsClose', '×', 'versions-close'); close.setAttribute('aria-label', 'Sürümler penceresini kapat');
  heading.append(headingText, close);
  const body = node('div', 'versions-body');
  const status = node('p', 'versions-status'); status.id = 'versionsStatus'; status.hidden = true;
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const error = node('p', 'versions-error'); error.id = 'versionsError'; error.hidden = true; error.setAttribute('role', 'alert');
  const engineError = node('p', 'versions-error'); engineError.id = 'versionsEngineError'; engineError.hidden = true; engineError.setAttribute('role', 'alert');
  body.append(status, error, engineError);

  const initial = node('section', 'versions-initial'); initial.id = 'versionsInitialSection';
  initial.append(node('h3', '', 'Önce mevcut tasarımını sakla'), node('p', '', 'Şu an açık olan yerleşim, ilk tasarım sürümün olacak.'));
  const initialForm = node('form', 'versions-name-form'); initialForm.id = 'versionsInitialForm';
  const initialName = input('versionsInitialName', 'Mevcut tasarım', 'Sürüm adı');
  const saveInitial = button('versionsSaveInitial', 'Mevcut tasarımı kaydet', 'versions-primary'); saveInitial.type = 'submit';
  initialForm.append(initialName.wrap, saveInitial); initial.append(initialForm);

  const saved = node('section', 'versions-saved'); saved.id = 'versionsSavedSection'; saved.hidden = true;
  const savedHead = node('div', 'versions-section-heading'), savedTitle = node('h3', '', 'Kayıtlı tasarımlar');
  const total = node('span', 'versions-total'); total.id = 'versionsTotal'; savedHead.append(savedTitle, total);
  const activeHint = node('p', 'versions-active-hint'); activeHint.id = 'versionsActiveHint';
  const list = node('div', 'versions-list'); list.id = 'versionsList'; list.setAttribute('role', 'list'); list.setAttribute('aria-label', 'Kayıtlı tasarım sürümleri');
  const saveActive = button('versionsSaveActive', 'Etkin sürümü kaydet');
  saved.append(savedHead, activeHint, list, saveActive);

  const copy = node('section', 'versions-copy'); copy.id = 'versionsCopySection'; copy.hidden = true;
  copy.append(node('h3', '', 'Yeni tasarım kopyası'), node('p', '', 'Açık tasarımı temel alır. Sonraki değişiklikler yeni sürüme kaydedilir.'));
  const copyForm = node('form', 'versions-name-form'); copyForm.id = 'versionsCopyForm';
  const copyName = input('versionsCopyName', 'İleriye dönük tasarım', 'Yeni sürümün adı');
  copyName.el.placeholder = 'Örn. İleriye dönük tasarım';
  const createCopy = button('versionsCreateCopy', 'Kopyayı oluştur', 'versions-primary'); createCopy.type = 'submit';
  copyForm.append(copyName.wrap, createCopy); copy.append(copyForm);

  const backup = node('section', 'versions-backup');
  backup.append(node('h3', '', 'Yedekle ve taşı'), node('p', '', 'Aynı çalışma bağlantısını kullanan kişiler bu sürümlerde birlikte devam eder. JSON yedeğini ayrıca indirebilirsin.'));
  const backupActions = node('div', 'versions-backup-actions');
  const exportAll = button('versionsExportAll', 'Tüm sürümleri yedekle'), importOpen = button('versionsImportOpen', 'Sürüm yedeği aç');
  const importInput = node('input'); importInput.id = 'versionsImportInput'; importInput.type = 'file';
  importInput.accept = '.json,application/json'; importInput.hidden = true; importInput.setAttribute('aria-label', 'Sürüm yedeği dosyası');
  backupActions.append(exportAll, importOpen); backup.append(backupActions, importInput);
  body.append(initial, saved, copy, backup); dialog.append(heading, body); d.body.append(dialog);

  function say(text, failure = false) {
    const target = failure ? error : status;
    setText(target, text); target.hidden = !text;
    if (failure) status.hidden = true;
  }

  async function perform(action, success, after) {
    if (busy) return false;
    busy = true; error.hidden = true; status.hidden = true; render();
    try {
      await action();
      if (success) say(typeof success === 'function' ? success() : success);
      if (after) after();
      return true;
    } catch (problem) {
      say(messageText(problem) || 'İşlem tamamlanamadı. Açık tasarımın korunuyor.', true);
      return false;
    } finally {
      busy = false; render();
    }
  }

  function makeCard(item) {
    const article = node('article', 'versions-card'); article.dataset.versionId = item.id; article.setAttribute('role', 'listitem');
    const info = node('div', 'versions-card-info'), nameRow = node('div', 'versions-card-name-row');
    const name = node('h4'), tag = node('span', 'versions-current-tag', 'Açık sürüm'); tag.hidden = true;
    const meta = node('p', 'versions-card-meta'), time = node('p', 'versions-card-time');
    nameRow.append(name, tag); info.append(nameRow, meta, time);
    const actions = node('div', 'versions-card-actions'), load = button('', 'Aç', 'versions-load'), edit = button('', 'Adını değiştir', 'versions-text-button');
    actions.append(load, edit);
    const renameForm = node('form', 'versions-rename-form'); renameForm.hidden = true;
    const renameLabel = node('label'), renameInput = node('input'); renameLabel.append(node('span', '', 'Sürüm adı'), renameInput);
    renameInput.type = 'text'; renameInput.maxLength = 80; renameInput.required = true; renameInput.autocomplete = 'off';
    const renameActions = node('div', 'versions-rename-actions'), renameSave = button('', 'Adı kaydet', 'versions-primary'), cancel = button('', 'Vazgeç'); renameSave.type = 'submit';
    renameActions.append(renameSave, cancel); renameForm.append(renameLabel, renameActions);
    article.append(info, actions, renameForm);
    const card = { article, name, tag, meta, time, load, edit, renameForm, renameInput, renameSave, cancel, item, editing: false };
    load.onclick = () => perform(() => api.switchTo(card.item.id), () => card.item.name + ' açıldı.', () => {
      if (typeof g.toast === 'function') g.toast(card.item.name + ' açıldı.');
      dialog.close();
    });
    edit.onclick = () => {
      card.editing = true; renameInput.value = card.item.name; renameForm.hidden = false;
      renameInput.focus(); renameInput.select();
    };
    cancel.onclick = () => { card.editing = false; renameForm.hidden = true; edit.focus(); };
    renameForm.onsubmit = event => {
      event.preventDefault();
      perform(() => api.rename(card.item.id, renameInput.value.trim()), 'Sürümün adı kaydedildi.', () => {
        card.editing = false; renameForm.hidden = true;
      });
    };
    return card;
  }

  function updateCard(card, item, state) {
    card.item = item;
    const current = !!item.active || item.id === state.activeId;
    card.article.classList.toggle('is-active', current); card.tag.hidden = !current;
    setText(card.name, item.name);
    setText(card.meta, countText(item.objectCount) + ' öğe · ' + countText(item.wallCount) + ' duvar');
    const date = dateText(item.updatedAt || item.createdAt);
    setText(card.time, date ? 'Son kayıt: ' + date : ''); card.time.hidden = !date;
    setText(card.load, current ? 'Şu an açık' : 'Aç');
    card.load.setAttribute('aria-label', current ? item.name + ' şu an açık' : item.name + ' sürümünü aç');
    card.edit.setAttribute('aria-label', item.name + ' sürümünün adını değiştir');
    card.renameInput.setAttribute('aria-label', item.name + ' için yeni sürüm adı');
    card.load.disabled = current || busy || !state.ready;
    card.edit.disabled = card.renameSave.disabled = card.cancel.disabled = card.renameInput.disabled = busy || !state.ready;
    card.renameForm.hidden = !card.editing;
  }

  function render() {
    let state;
    try { state = api.getState(); }
    catch (problem) { state = { ready: false, error: messageText(problem), items: [] }; }
    state = state || { ready: false, items: [] };
    const items = Array.isArray(state.items) ? state.items.slice() : [];
    const active = items.find(item => item.id === state.activeId || item.active);
    badge.hidden = !active;
    mobileBadge.hidden = !active;
    d.body.classList.toggle('versions-has-active', !!active);
    if (active) {
      setText(badge, 'Sürüm: ' + active.name); badge.title = active.name;
      setText(mobileBadge, 'Sürüm: ' + active.name); mobileBadge.title = active.name;
      mobileBadge.setAttribute('aria-label', 'Etkin tasarım sürümü: ' + active.name);
    }
    const engineMessage = messageText(state.error);
    setText(engineError, engineMessage); engineError.hidden = !engineMessage;
    initial.hidden = items.length > 0; saved.hidden = copy.hidden = items.length === 0;
    setText(total, items.length + ' sürüm');
    setText(activeHint, active ? active.name + ' açık. Değişiklikler bu sürüme otomatik kaydedilir.' : 'Açmak istediğin tasarımı seç.');
    saveInitial.disabled = initialName.el.disabled = busy || !state.ready;
    createCopy.disabled = copyName.el.disabled = busy || !state.ready || !active;
    saveActive.disabled = busy || !state.ready || !active;
    exportAll.disabled = busy || !state.ready || !items.length;
    importOpen.disabled = importInput.disabled = busy || !state.ready;
    dialog.setAttribute('aria-busy', String(busy));
    const ordered = items.sort((a, b) => Number(b.id === state.activeId || b.active) - Number(a.id === state.activeId || a.active)
      || String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || String(a.name).localeCompare(String(b.name), 'tr'));
    const ids = new Set(ordered.map(item => item.id));
    for (const [id, card] of cards) if (!ids.has(id)) { card.article.remove(); cards.delete(id); }
    for (const item of ordered) {
      let card = cards.get(item.id);
      if (!card) { card = makeCard(item); cards.set(item.id, card); }
      updateCard(card, item, state);
    }
    const order = ordered.map(item => item.id).join('|');
    if (order !== cardOrder) { ordered.forEach(item => list.append(cards.get(item.id).article)); cardOrder = order; }
    return state;
  }

  function schedule() {
    if (scheduled) return; scheduled = true;
    (g.requestAnimationFrame || (callback => setTimeout(callback, 0)))(() => { scheduled = false; render(); });
  }
  function openDialog() {
    error.hidden = true; status.hidden = true; render();
    if (!dialog.open) dialog.showModal();
    title.focus();
  }
  open.onclick = openDialog; close.onclick = () => dialog.close();
  dialog.addEventListener('close', () => { if (d.activeElement === d.body || dialog.contains(d.activeElement)) open.focus(); });
  initialForm.onsubmit = event => {
    event.preventDefault();
    perform(() => api.saveCurrent(initialName.el.value.trim()), 'Mevcut tasarımın ayrı bir sürüm olarak kaydedildi.', () => {
      copyName.el.focus(); copyName.el.select();
    });
  };
  copyForm.onsubmit = event => {
    event.preventDefault();
    perform(() => api.createCopy(copyName.el.value.trim()), 'Yeni tasarım kopyası açıldı. Artık bu sürüm üzerinde çalışıyorsun.');
  };
  saveActive.onclick = () => perform(() => api.saveCurrent(), 'Etkin tasarım sürümü kaydedildi.');
  exportAll.onclick = () => perform(() => {
    const bundle = api.exportData(), payload = JSON.stringify(bundle, null, 2);
    const filename = 'somass-tasarim-surumleri-' + backupStamp() + '.json';
    if (typeof g.download === 'function') g.download(payload, filename, 'application/json');
    else {
      const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' })), link = d.createElement('a');
      link.href = url; link.download = filename; d.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    }
  }, 'Tüm tasarım sürümlerinin yedeği indirildi.');
  importOpen.onclick = () => { if (!busy) importInput.click(); };
  importInput.onchange = () => {
    const file = importInput.files?.[0]; if (!file) return;
    perform(async () => {
      if (file.size > 20 * 1024 * 1024) throw Error('Sürüm yedeği 20 MB sınırını aşıyor.');
      let bundle;
      try { bundle = JSON.parse(await file.text()); }
      catch (_) { throw Error('Bu sürüm yedeği okunamadı. JSON dosyasını kontrol et.'); }
      await api.importData(bundle);
    }, 'Yedekteki tasarımlar yeni sürümler olarak eklendi.').finally(() => { importInput.value = ''; });
  };
  g.addEventListener('somass:versions-change', schedule);
  d.addEventListener('somass:versions-change', schedule);
  g.SOMASS_VERSIONS_UI = { open: openDialog, refresh: render, close: () => dialog.close() };
  render();
})(typeof globalThis !== 'undefined' ? globalThis : this);
