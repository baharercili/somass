/* A single selection dock reuses the planner's existing edit controls. */
(function (global) {
  'use strict';
  const number = value => Number.isFinite(Number(value))
    ? new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(Number(value)) : '—';
  const distance = wall => Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
  const searchText = value => String(value || '').toLocaleLowerCase('tr-TR').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').trim().replace(/\s+/g, ' ');

  // Only presentation changes: a query never changes the native selected value.
  function filterObjectOptions(select, query) {
    const text = searchText(query), selectedValue = select.value;
    let matches = 0, total = 0, selectedPreserved = false;
    for (const option of Array.from(select.options)) {
      if (!option.value) { if (option.hidden) option.hidden = false; continue; }
      total++;
      const match = !text || searchText(option.textContent).includes(text);
      if (match) matches++;
      const current = option.value === selectedValue;
      if (current && !match) selectedPreserved = true;
      const hidden = !match && !current;
      if (option.hidden !== hidden) option.hidden = hidden;
    }
    return { matches, total, selectedPreserved, query: text };
  }

  function describeSelection(plan, id, decor = global.SOMASS_DECOR) {
    if (!plan || !id) return null;
    const object = plan.objects?.find(item => item.id === id);
    const opening = plan.openings?.find(item => item.id === id);
    let wall = plan.walls?.find(item => item.id === id);
    if (!object && !opening && !wall) {
      try { wall = decor?.frame?.(plan, id)?.wall; } catch (_) { /* Unknown auxiliary selection. */ }
    }
    if (object) {
      let resolved = object;
      if (decor?.isElement?.(object)) {
        try { resolved = decor.resolve(object, plan); } catch (_) { /* Keep readable saved dimensions. */ }
      }
      const paint = object.kind === 'wall-finish';
      const mounted = !!decor?.mounted?.(object);
      const metrics = [{ label: paint ? 'Genişlik' : 'En', value: number(resolved.w) + ' cm' }];
      if (!paint) metrics.push({ label: 'Derinlik', value: number(resolved.h) + ' cm' });
      const height = object.catalogProduct?.heightCm ?? resolved.heightCm;
      if (!paint && Number.isFinite(height)) metrics.push({ label: 'Yükseklik', value: number(height) + ' cm' });
      if (!mounted) metrics.push({ label: 'Açı', value: number(resolved.rotation || 0) + '°' });
      return {
        id, kind: paint ? 'paint' : decor?.isElement?.(object) ? 'decor' : 'object',
        title: paint ? (object.paintName || 'Duvar boyası') : (object.label || 'Seçili öğe'),
        category: paint ? 'BOYA YÜZEYİ' : object.catalogProduct ? 'SOMASS ÜRÜNÜ'
          : object.kind === 'partition' ? 'BÖLÜCÜ DUVAR' : object.type === 'column' ? 'KOLON' : 'YERLEŞİM ÖĞESİ',
        paintCode: paint ? String(object.paintCode || '') : '',
        color: paint && /^#[0-9a-f]{6}$/i.test(object.color || '') ? object.color : '',
        metrics, mounted, duplicate: !mounted && !object.columnAnchor,
        rotate: !mounted, remove: true, nativeObject: true,
        editable3d: !!object.catalogProduct || (object.type === 'furniture' && (object.kind === 'partition' || !!decor?.isElement?.(object)))
      };
    }
    if (opening) return {
      id, kind: 'opening', title: opening.type === 'door' ? 'Kapı' : 'Pencere', category: 'AÇIKLIK',
      metrics: [{ label: 'Genişlik', value: number(opening.width) + ' cm' },
        { label: 'Başlangıçtan', value: number(opening.offset) + ' cm' }],
      rotate: false, duplicate: false, remove: true
    };
    if (wall) return {
      id, kind: 'wall', title: wall.label || (plan.walls?.includes(wall)
        ? 'Duvar ' + String(plan.walls.indexOf(wall) + 1).padStart(2, '0') : 'İç duvar'),
      category: 'DUVAR', metrics: [{ label: 'Uzunluk', value: number(distance(wall)) + ' cm' }],
      rotate: false, duplicate: false, remove: !!plan.walls?.includes(wall)
    };
    return { id, kind: 'other', title: 'Seçili öğe', category: 'AYRINTILAR', metrics: [], rotate: false, duplicate: false, remove: false };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { describeSelection, filterObjectOptions };
  if (!global.document) return;
  const doc = global.document;
  let host = null, panel = null, originalSelection = null, native3dEditor = null;
  let scheduled = false, lastSummary = '', lastSelection = null, lastMode = '';
  let lastFilterKey = '', lastFilterOptions = [];
  const byId = id => doc.getElementById(id);
  const active3d = () => global.SOMASS_SPACE_3D?.isActive?.() === true;
  const state = () => typeof model !== 'undefined' ? model : null;
  const selection = () => typeof selected !== 'undefined' ? selected : null;
  const notifyOpen = () => {
    global.SOMASS_STUDIO_UI?.showInspector?.();
    host?.dispatchEvent(new CustomEvent('somass:inspector-open', { bubbles: true }));
  };

  function schedule() {
    if (scheduled || !host) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; refresh(); });
  }

  function nativeClick(id) {
    const button = byId(id);
    if (button && !button.disabled) { button.click(); return true; }
    return false;
  }

  function filterObjects() {
    const input = byId('uiInspectorObjectSearch'), select = byId('space3dProductSelect');
    if (!input || !select) return;
    const options = Array.from(select.options), key = input.value + '\u0000' + select.value;
    if (key === lastFilterKey && options.length === lastFilterOptions.length
      && options.every((option, index) => option === lastFilterOptions[index])) return;
    const result = filterObjectOptions(select, input.value);
    byId('uiInspectorSearchClear').hidden = !input.value;
    byId('uiInspectorObjectCount').textContent = result.query
      ? result.matches + ' eşleşme' + (result.selectedPreserved ? ' · Seçili öğe korunuyor' : '')
      : result.total + ' öğe';
    lastFilterKey = key; lastFilterOptions = options;
  }

  function edit() {
    const description = describeSelection(state(), selection());
    if (!description) return;
    notifyOpen();
    if (description.kind === 'paint' || description.kind === 'decor') {
      global.SOMASS_DECOR_UI?.openEdit?.(description.id);
      return;
    }
    if (active3d() && description.editable3d) {
      if (byId('space3dProductControls')?.hidden) nativeClick('space3dFloatDetails');
      byId('space3dProductX')?.focus({ preventScroll: true });
      return;
    }
    const details = byId('uiInspectorMeasurements');
    if (details) details.open = true;
    originalSelection?.querySelector('input:not([readonly]):not([disabled])')?.focus({ preventScroll: true });
  }

  function clearSelection() {
    global.SOMASS_3D_EDIT?.cancelDrag?.();
    if (active3d() && global.SOMASS_3D_EDIT?.select) global.SOMASS_3D_EDIT.select(null);
    else if (typeof selected !== 'undefined') {
      selected = null;
      global.SOMASS_PRECISION?.noteSelection?.(null, null);
      if (typeof render === 'function') render();
      if (typeof renderPanels === 'function') renderPanels();
    }
    schedule();
  }

  function action(name) {
    const item = describeSelection(state(), selection());
    if (!item) return;
    if (name === 'clear') { clearSelection(); return; }
    if (name === 'edit') { edit(); return; }
    if (name === 'focus') {
      if (active3d()) nativeClick('space3dFocusProduct');
      return;
    }
    if (name === 'duplicate' && item.duplicate) {
      if (active3d() && item.editable3d) nativeClick('space3dDuplicateProduct');
      else global.SOMASS_OBJECT_ACTIONS?.duplicate?.();
    }
    if (name === 'delete' && item.remove) {
      if (active3d() && item.editable3d) nativeClick('space3dDeleteProduct');
      else global.SOMASS_OBJECT_ACTIONS?.remove?.();
    }
    if ((name === 'left' || name === 'right') && item.rotate) {
      if (active3d() && item.editable3d) nativeClick(name === 'left' ? 'space3dRotateLeft' : 'space3dRotateRight');
      else {
        const object = state()?.objects?.find(value => value.id === item.id);
        if (object) global.SOMASS_OBJECT_ACTIONS?.applyAngle?.((object.rotation || 0) + (name === 'left' ? -15 : 15));
      }
    }
    schedule();
  }

  function refresh() {
    if (!host || !panel) return;
    const item = describeSelection(state(), selection()), mode = active3d() ? '3d' : '2d';
    host.dataset.view = mode;
    host.dataset.kind = item?.kind || 'empty';
    panel.dataset.hasSelection = String(!!item);
    const nativeObject3d = !!(mode === '3d' && item?.editable3d);
    byId('uiInspector2dSlot').hidden = !item || nativeObject3d || ['paint', 'decor'].includes(item.kind);
    byId('uiInspector3dSlot').hidden = mode !== '3d';
    filterObjects();
    const key = JSON.stringify([item, mode]);
    if (key !== lastSummary) {
      lastSummary = key;
      byId('uiInspectorCategory').textContent = item?.category || 'SEÇİLİ ÖĞE';
      byId('uiInspectorTitle').textContent = item?.title || 'Bir duvar veya ürün seç';
      byId('uiInspectorEmpty').hidden = !!item;
      byId('uiInspectorActions').hidden = !item;
      const metrics = byId('uiInspectorMetrics'); metrics.replaceChildren();
      for (const metric of item?.metrics || []) {
        const row = doc.createElement('div'), term = doc.createElement('dt'), value = doc.createElement('dd');
        term.textContent = metric.label; value.textContent = metric.value;
        row.append(term, value); metrics.append(row);
      }
      const paint = byId('uiInspectorPaint'); paint.hidden = !item?.paintCode;
      byId('uiInspectorPaintSwatch').style.backgroundColor = item?.color || '#e5e7df';
      byId('uiInspectorPaintCode').textContent = item?.paintCode ? 'Jotun ' + item.paintCode : '';
      byId('uiInspectorPaintName').textContent = item?.paintCode ? item.title : '';
      const editButton = panel.querySelector('[data-inspector-action="edit"]');
      editButton.textContent = item?.kind === 'paint' ? 'Rengi ve yüzeyi düzenle' : item?.kind === 'decor' ? 'Malzeme ve ölçüler' : 'Ölçüleri düzenle';
      for (const name of ['duplicate', 'left', 'right', 'delete', 'focus']) {
        const button = panel.querySelector('[data-inspector-action="' + name + '"]');
        const available = name === 'duplicate' ? item?.duplicate : name === 'delete' ? item?.remove
          : name === 'focus' ? nativeObject3d : item?.rotate;
        button.hidden = !available;
        button.disabled = !available;
      }
    }
    if (item?.id !== lastSelection || mode !== lastMode) {
      const details = byId('uiInspectorMeasurements');
      if (details) details.open = !!item && ['wall', 'opening', 'other'].includes(item.kind);
      host.dispatchEvent(new CustomEvent('somass:inspector-selection', { bubbles: true,
        detail: { selected: !!item, kind: item?.kind || null, mode } }));
      lastSelection = item?.id || null; lastMode = mode;
    }
  }

  function mount(target) {
    const nextHost = typeof target === 'string' ? doc.querySelector(target) : target;
    if (!nextHost) return false;
    if (host) {
      if (host !== nextHost) { nextHost.append(panel); host = nextHost; }
      refresh(); return true;
    }
    originalSelection = byId('selectionPanel'); native3dEditor = byId('space3dProductEditor');
    if (!originalSelection || !native3dEditor) return false;
    host = nextHost;
    panel = doc.createElement('div'); panel.className = 'ui-inspector-content';
    panel.innerHTML = '<section id="uiInspectorSummary" class="ui-inspector-summary" aria-label="Seçili öğe özeti">'
      + '<span id="uiInspectorCategory" class="ui-inspector-eyebrow">SEÇİLİ ÖĞE</span>'
      + '<div class="ui-inspector-heading"><h2 id="uiInspectorTitle">Bir duvar veya ürün seç</h2><button type="button" class="ui-inspector-clear" data-inspector-action="clear" aria-label="Seçimi temizle" title="Seçimi temizle">×</button></div>'
      + '<p id="uiInspectorEmpty" class="ui-inspector-empty">Planda seçtiğin öğenin ölçüleri ve işlemleri burada açılır.</p>'
      + '<div id="uiInspectorPaint" class="ui-inspector-paint" hidden><i id="uiInspectorPaintSwatch"></i><span><strong id="uiInspectorPaintCode"></strong><small id="uiInspectorPaintName"></small></span></div>'
      + '<dl id="uiInspectorMetrics" class="ui-inspector-metrics"></dl>'
      + '<div id="uiInspectorActions" class="ui-inspector-actions" hidden><button type="button" class="ui-inspector-edit" data-inspector-action="edit">Ölçüleri düzenle</button><div class="ui-inspector-short-actions">'
      + '<button type="button" data-inspector-action="focus">Yaklaş</button><button type="button" data-inspector-action="duplicate">Kopyala</button>'
      + '<button type="button" data-inspector-action="left" aria-label="Seçili öğeyi sola döndür">↶</button><button type="button" data-inspector-action="right" aria-label="Seçili öğeyi sağa döndür">↷</button>'
      + '<button type="button" class="ui-inspector-delete" data-inspector-action="delete">Sil</button></div></div></section>'
      + '<section id="uiInspector2dSlot" class="ui-inspector-editor" hidden><details id="uiInspectorMeasurements"><summary>Ölçüler ve konum</summary></details></section>'
      + '<section id="uiInspector3dSlot" class="ui-inspector-editor" hidden></section>';
    host.append(panel);
    byId('uiInspectorMeasurements').append(originalSelection);
    byId('uiInspector3dSlot').append(native3dEditor);
    const search = doc.createElement('section'); search.className = 'ui-inspector-search';
    search.innerHTML = '<label for="uiInspectorObjectSearch">Plandaki öğeyi bul</label>'
      + '<div class="ui-inspector-search-field"><input type="search" id="uiInspectorObjectSearch" placeholder="Ürün adıyla ara…" autocomplete="off" spellcheck="false">'
      + '<button type="button" id="uiInspectorSearchClear" aria-label="Aramayı temizle" title="Aramayı temizle" hidden>×</button></div>'
      + '<p id="uiInspectorObjectCount" role="status" aria-live="polite"></p>';
    native3dEditor.prepend(search);
    const searchInput = byId('uiInspectorObjectSearch');
    const clearSearch = () => { searchInput.value = ''; filterObjects(); searchInput.focus({ preventScroll: true }); };
    searchInput.addEventListener('input', filterObjects);
    searchInput.addEventListener('keydown', event => {
      if (event.key === 'Escape' && searchInput.value) {
        event.preventDefault(); event.stopPropagation(); clearSearch();
      }
    });
    byId('uiInspectorSearchClear').addEventListener('click', clearSearch);
    panel.addEventListener('pointerdown', event => event.stopPropagation());
    panel.addEventListener('click', event => {
      const button = event.target.closest('[data-inspector-action]');
      if (button && !button.disabled) action(button.dataset.inspectorAction);
    });
    if (typeof render === 'function') {
      const previous = render;
      render = function (...args) { const result = previous.apply(this, args); schedule(); return result; };
    }
    if (typeof renderPanels === 'function') {
      const previous = renderPanels;
      renderPanels = function (...args) { const result = previous.apply(this, args); schedule(); return result; };
    }
    const observer = new MutationObserver(records => {
      if (records.some(record => record.type !== 'attributes' || record.target.tagName !== 'OPTION')) schedule();
    });
    observer.observe(originalSelection, { childList: true, subtree: true });
    observer.observe(native3dEditor, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-pressed'] });
    const spaceHost = byId('space3dHost');
    if (spaceHost) observer.observe(spaceHost, { attributes: true, attributeFilter: ['hidden'] });
    doc.body.classList.add('ui-inspector-mounted');
    refresh();
    return true;
  }

  global.SOMASS_UI_INSPECTOR = { mount, refresh, schedule, edit, clearSelection, describeSelection, filterObjects };
})(typeof globalThis !== 'undefined' ? globalThis : this);
