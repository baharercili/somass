/* Independent, named browser-local design workspaces. The original plan format stays intact. */
(function (g) {
  'use strict';
  const FORMAT = 'somass-design-versions', MAX_VERSIONS = 30, MAX_BACKUP_BYTES = 20 * 1024 * 1024;
  const copy = value => JSON.parse(JSON.stringify(value));
  function fingerprint(plan) {
    function ordered(value, top) {
      if (Array.isArray(value)) return value.map(item => ordered(item, false));
      if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
        .filter(key => !(top && key === 'projectUpdatedAt')).map(key => [key, ordered(value[key], false)]));
      return value;
    }
    return JSON.stringify(ordered(plan, true));
  }
  function createEngine(context) {
    const storage = context.storage, session = context.session;
    const prefix = context.storageKey + '::design-versions:v1:', entryPrefix = prefix + 'entry:';
    const sessionKey = prefix + 'active-session', lastKey = prefix + 'last-opened';
    const now = context.now || (() => new Date().toISOString());
    let serial = 0, activeId = null, seenRevision = null, seenFingerprint = null, lastError = '', busy = false;
    let lastEntries = [];
    const makeId = context.makeId || (() => g.crypto?.randomUUID?.() || 'v-' + Date.now().toString(36) + '-' + (++serial) + '-' + Math.random().toString(36).slice(2));
    const validatePlan = plan => copy(context.validatePlan(copy(plan)));
    const flags = () => context.getFlags?.() || {};
    const friendlyStorage = () => Error('Sürüm kaydedilemedi. Açık plan korunuyor; tüm sürümleri yedekleyip yeniden deneyebilirsin.');
    function checkedName(value) {
      if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) throw Error('Sürüm adına 1–80 karakter yaz.');
      return value.trim();
    }
    function uniqueName(value, entries, exclude) {
      const base = checkedName(value), names = new Set(entries.filter(item => item.id !== exclude).map(item => item.name.toLocaleLowerCase('tr-TR')));
      if (!names.has(base.toLocaleLowerCase('tr-TR'))) return base;
      let i = 2;
      for (;;) { const suffix = ' (' + i++ + ')', result = base.slice(0, 80 - suffix.length) + suffix;
        if (!names.has(result.toLocaleLowerCase('tr-TR'))) return result; }
    }
    function checkedEntry(value, expectedId) {
      if (!value || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(value.id) || (expectedId && value.id !== expectedId)
        || typeof value.revision !== 'string' || !value.revision || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
        || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) throw Error('Bir sürüm kaydı okunamadı. Mevcut kayıtlar korunuyor.');
      return { id: value.id, name: checkedName(value.name), createdAt: value.createdAt, updatedAt: value.updatedAt,
        revision: value.revision, plan: validatePlan(value.plan) };
    }
    function scan() {
      const entries = [];
      try {
        const keys = [];
        for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key?.startsWith(entryPrefix)) keys.push(key); }
        if (keys.length > MAX_VERSIONS) throw Error('Sürüm sınırı aşıldı. Mevcut kayıtlar korunuyor.');
        for (const key of keys) {
          const raw = storage.getItem(key); if (raw === null) continue;
          entries.push(checkedEntry(JSON.parse(raw), key.slice(entryPrefix.length)));
        }
      } catch (error) {
        if (error?.message?.startsWith('Sürüm sınırı')) throw error;
        throw Error('Sürüm kayıtları okunamadı. Mevcut tasarım ve kayıtlar korunuyor.');
      }
      entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      lastEntries = entries; return entries;
    }
    function ensureReady() {
      const state = flags();
      if (state.restoreFailed) throw Error('Önceki plan okunamadığı için sürüm kaydı durduruldu. Önce geçerli plan yedeğini aç.');
      if (state.storageUnavailable) throw Error('Bu tarayıcı kayıt tutamıyor. Plan yedeğini indirerek saklayabilirsin.');
      return scan();
    }
    function getState() {
      let entries = lastEntries, ready = true, error = lastError;
      try { entries = ensureReady(); } catch (problem) { ready = false; error = problem.message; }
      return { ready, error, activeId, items: entries.map(item => ({ id: item.id, name: item.name,
        createdAt: item.createdAt, updatedAt: item.updatedAt, objectCount: item.plan.objects.length,
        wallCount: item.plan.walls.length, active: item.id === activeId })) };
    }
    function emit() { context.onChange?.(getState()); }
    function fail(problem) { lastError = problem?.message || 'İşlem tamamlanamadı. Açık plan korunuyor.'; emit(); throw Error(lastError); }
    function action(fn) {
      if (busy) throw Error('Önce açık sürüm işleminin bitmesini bekle.');
      busy = true;
      try { const result = fn(); lastError = ''; emit(); return result; }
      catch (problem) { return fail(problem); }
      finally { busy = false; }
    }
    function readEntry(id) {
      const raw = storage.getItem(entryPrefix + id);
      if (raw === null) throw Error('Bu sürüm bulunamadı. Açık plan korunuyor.');
      try { return checkedEntry(JSON.parse(raw), id); } catch (_) { throw Error('Sürüm kaydı okunamadı. Açık plan korunuyor.'); }
    }
    function writeEntry(entry) {
      const text = JSON.stringify(entry);
      try {
        storage.setItem(entryPrefix + entry.id, text);
        if (storage.getItem(entryPrefix + entry.id) !== text) throw Error('concurrent-write');
      } catch (_) { throw friendlyStorage(); }
      return entry;
    }
    function remember(entry) { activeId = entry.id; seenRevision = entry.revision; seenFingerprint = fingerprint(entry.plan); }
    function pointers(id) {
      let previousSession = null, previousLast = null, wroteSession = false, wroteLast = false;
      try {
        previousSession = session.getItem(sessionKey); previousLast = storage.getItem(lastKey);
        session.setItem(sessionKey, id); wroteSession = true;
        storage.setItem(lastKey, id); wroteLast = true;
      } catch (_) {
        if (wroteSession) try { previousSession === null ? session.removeItem(sessionKey) : session.setItem(sessionKey, previousSession); } catch (_) {}
        if (wroteLast) try { previousLast === null ? storage.removeItem(lastKey) : storage.setItem(lastKey, previousLast); } catch (_) {}
        throw Error('Sürüm saklandı, ancak açılamadı. Açık tasarım değişmedi; sürüm listesinden tekrar açabilirsin.');
      }
    }
    function freshEntry(name, plan, entries) {
      if (entries.length >= MAX_VERSIONS) throw Error('En fazla 30 tasarım sürümü saklanabilir.');
      const stamp = now();
      return { id: makeId(), name: uniqueName(name, entries), createdAt: stamp, updatedAt: stamp, revision: makeId(), plan: validatePlan(plan) };
    }
    function nativeSave() {
      if (context.writeNative() !== true) throw Error('Açık plan kaydedilemedi. Sürüm değişmedi; önce plan yedeğini indir.');
    }
    function captureCurrentInternal(name) {
      const entries = ensureReady(), plan = validatePlan(context.getPlan());
      if (!activeId) {
        const created = writeEntry(freshEntry(name || 'Mevcut tasarım', plan, entries));
        pointers(created.id); remember(created); return created;
      }
      const current = readEntry(activeId), currentFingerprint = fingerprint(current.plan);
      if (current.revision !== seenRevision && currentFingerprint !== seenFingerprint) {
        const recovered = writeEntry(freshEntry(current.name.slice(0, 60) + ' · kurtarma kopyası', plan, entries));
        pointers(recovered.id); remember(recovered);
        context.onNotice?.('Başka sekmedeki değişiklik korundu. Bu sekmedeki tasarım ayrı bir kurtarma kopyasına kaydedildi.');
        return recovered;
      }
      const next = { ...current, name: name === undefined ? current.name : uniqueName(name, entries, current.id),
        updatedAt: now(), revision: makeId(), plan };
      writeEntry(next); remember(next); return next;
    }
    function flush(name) { ensureReady(); nativeSave(); return captureCurrentInternal(name); }
    function activate(entry) {
      const nextPlan = validatePlan(entry.plan), previousPlan = validatePlan(context.getPlan());
      const previous = { activeId, seenRevision, seenFingerprint };
      const previousEditor = context.captureEditorState?.();
      try {
        context.adoptPlan(nextPlan); nativeSave(); pointers(entry.id); remember(entry);
      } catch (problem) {
        try { context.adoptPlan(previousPlan); context.writeNative(); } catch (_) {}
        try { context.restoreEditorState?.(previousEditor); } catch (_) {}
        activeId = previous.activeId; seenRevision = previous.seenRevision; seenFingerprint = previous.seenFingerprint;
        if (previous.activeId) try { pointers(previous.activeId); } catch (_) {}
        throw problem;
      }
      return entry;
    }
    function saveCurrent(name) { return action(() => flush(name)); }
    function createCopy(name) {
      return action(() => {
        flush(); const entries = ensureReady();
        const entry = writeEntry(freshEntry(name || 'İleriye dönük tasarım', context.getPlan(), entries));
        return activate(entry);
      });
    }
    function switchTo(id) {
      return action(() => {
        ensureReady(); readEntry(id); flush();
        if (id === activeId) return readEntry(id);
        return activate(readEntry(id));
      });
    }
    function rename(id, name) {
      return action(() => {
        let entries = ensureReady(); readEntry(id);
        const renamingActive = id === activeId;
        if (renamingActive) { flush(); id = activeId; }
        entries = ensureReady();
        const current = readEntry(id), next = { ...current, name: uniqueName(name, entries, id), updatedAt: now(), revision: makeId() };
        writeEntry(next); if (id === activeId) remember(next); return next;
      });
    }
    function exportData() {
      return action(() => {
        const entries = ensureReady().map(copy), plan = validatePlan(context.getPlan());
        const current = entries.find(entry => entry.id === activeId);
        let exportActive = activeId;
        if (!current) { const entry = freshEntry('Mevcut tasarım', plan, entries); entries.push(entry); exportActive = entry.id; }
        else if (current.revision !== seenRevision && fingerprint(current.plan) !== seenFingerprint) {
          const entry = freshEntry(current.name.slice(0, 60) + ' · kurtarma kopyası', plan, entries); entries.push(entry); exportActive = entry.id;
        } else { current.plan = plan; current.updatedAt = now(); }
        const bundle = { format: FORMAT, schemaVersion: 1, exportedAt: now(), activeId: exportActive, versions: entries };
        if (new TextEncoder().encode(JSON.stringify(bundle)).length > MAX_BACKUP_BYTES) throw Error('Sürüm yedeği 20 MB sınırını aşıyor.');
        return bundle;
      });
    }
    function validatedBundle(value) {
      if (!value || value.format !== FORMAT || value.schemaVersion !== 1 || !Array.isArray(value.versions)
        || !value.versions.length || value.versions.length > MAX_VERSIONS) throw Error('Geçerli bir SOMASS sürüm yedeği seç.');
      if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_BACKUP_BYTES) throw Error('Sürüm yedeği 20 MB sınırını aşıyor.');
      const ids = new Set(), entries = value.versions.map(item => {
        const entry = checkedEntry(item); if (ids.has(entry.id)) throw Error('Sürüm yedeğinde tekrar eden kayıt var.'); ids.add(entry.id); return entry;
      });
      if (typeof value.activeId !== 'string' || !ids.has(value.activeId)) throw Error('Sürüm yedeğinin açık tasarım bilgisi geçersiz.');
      return { entries, activeId: value.activeId };
    }
    function importData(value) {
      return action(() => {
        const checked = validatedBundle(value), initial = ensureReady();
        if (initial.length + checked.entries.length + (activeId ? 0 : 1) > MAX_VERSIONS) throw Error('Bu yedekle birlikte 30 sürüm sınırı aşılır. Mevcut kayıtlar korunuyor.');
        flush(); let existing = ensureReady(); const staged = [], idMap = new Map();
        for (const incoming of checked.entries) {
          const entry = freshEntry(incoming.name, incoming.plan, existing);
          entry.createdAt = incoming.createdAt; entry.updatedAt = incoming.updatedAt;
          staged.push(entry); existing = [...existing, entry]; idMap.set(incoming.id, entry.id);
        }
        const written = [];
        try { for (const entry of staged) { written.push(entry.id); writeEntry(entry); } }
        catch (problem) { for (const id of written) try { storage.removeItem(entryPrefix + id); } catch (_) {} throw problem; }
        const chosen = staged.find(entry => entry.id === idMap.get(checked.activeId));
        activate(chosen); return { count: staged.length, activeId: chosen.id };
      });
    }
    function importPlan(plan, name) {
      const valid = validatePlan(plan), stamp = now(), id = makeId();
      return importData({ format: FORMAT, schemaVersion: 1, activeId: id, versions: [{ id, name: checkedName(name || valid.name || 'Açılan plan'),
        createdAt: stamp, updatedAt: stamp, revision: makeId(), plan: valid }] });
    }
    function captureCurrent() {
      if (!activeId || busy) return true;
      try { captureCurrentInternal(); lastError = ''; emit(); return true; }
      catch (problem) { lastError = problem.message; emit(); throw problem; }
    }
    function refresh() { emit(); return getState(); }
    function boot() {
      try {
        const entries = ensureReady(); if (!entries.length) return;
        const bootPlan = validatePlan(context.getPlan()), restored = context.wasNativeRestored?.() === true;
        const matching = entries.find(entry => fingerprint(entry.plan) === fingerprint(bootPlan));
        if (restored && !matching) {
          const recovery = writeEntry(freshEntry('Kurtarılan çalışma', bootPlan, entries));
          pointers(recovery.id); remember(recovery); return;
        }
        let wanted = session.getItem(sessionKey) || storage.getItem(lastKey), target = entries.find(entry => entry.id === wanted);
        target = target || matching || entries[entries.length - 1];
        if (matching?.id === target.id) { pointers(target.id); remember(target); }
        else activate(target);
      } catch (problem) { lastError = problem.message; }
    }
    const api = { getState, saveCurrent, createCopy, switchTo, rename, exportData, importData, importPlan, captureCurrent, refresh,
      constants: { format: FORMAT, maxVersions: MAX_VERSIONS, maxBackupBytes: MAX_BACKUP_BYTES } };
    boot(); return api;
  }
  const internals = { createEngine, fingerprint, FORMAT, MAX_VERSIONS, MAX_BACKUP_BYTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = internals;
  if (!g.document || typeof model === 'undefined' || typeof validateState !== 'function' || typeof persist !== 'function') return;
  const originalPersist = persist, originalImport = typeof deleteConfirmImport === 'function' ? deleteConfirmImport : null;
  function safeCall(object, method, ...args) { try { object?.[method]?.(...args); } catch (_) {} }
  function adoptPlan(next) {
    safeCall(g.SOMASS_3D_EDIT, 'cancelDrag'); safeCall(g.SOMASS_DECOR_UI, 'cancelPick');
    for (const object of [g.SOMASS_PARTITIONS, g.SOMASS_CATALOG_PLACEMENT, g.SOMASS_GUIDES, g.SOMASS_FLOOR_JOINTS,
      g.SOMASS_INSTALLATIONS, g.SOMASS_TILE_FLOOR]) safeCall(object, 'cancelPick', false);
    safeCall(g.SOMASS_DOORS, 'cancelDrag'); safeCall(g.SOMASS_SHOWROOM_UI, 'close'); safeCall(g.SOMASS_DESIGN_UI, 'close');
    safeCall(g.SOMASS_INLINE_DETAILS, 'close');
    document.querySelectorAll('.decor-inline,.partition-inline').forEach(element => { element.hidden = true; });
    if (typeof pointers !== 'undefined') pointers.clear();
    if (typeof pinch !== 'undefined') pinch = null;
    setTool('select'); model = next; selected = null; drawStart = null; hover = null; drag = null;
    undoStack = []; redoStack = [];
    if (typeof refreshEasy === 'function') refreshEasy.lastObject = null;
    safeCall(g.SOMASS_PRECISION, 'noteSelection', null, null); safeCall(g.SOMASS_3D_EDIT, 'select', null);
    render(); renderPanels(); syncFields(); safeCall(g.SOMASS_3D_EDIT, 'refresh'); safeCall(g.SOMASS_SPACE_3D, 'refresh');
    safeCall(g.SOMASS_UI_INSPECTOR, 'schedule');
  }
  let browserStorage, tabStorage, storageAccessFailed = false;
  const unavailableStorage = { get length() { throw Error('unavailable'); }, key() { throw Error('unavailable'); },
    getItem() { throw Error('unavailable'); }, setItem() { throw Error('unavailable'); }, removeItem() { throw Error('unavailable'); } };
  try { browserStorage = g.localStorage; tabStorage = g.sessionStorage; }
  catch (_) { storageAccessFailed = true; browserStorage = tabStorage = unavailableStorage; }
  const engine = createEngine({ storage: browserStorage, session: tabStorage,
    storageKey: g.SOMASS_STATIC_SITE?.storageKey || STORAGE, validatePlan: validateState, getPlan: () => model,
    adoptPlan, writeNative: () => originalPersist(),
    captureEditorState: () => ({ undo: copy(undoStack), redo: copy(redoStack), selected }),
    restoreEditorState: state => {
      if (!state) return;
      undoStack = state.undo; redoStack = state.redo; selected = state.selected;
      render(); renderPanels(); syncFields(); safeCall(g.SOMASS_3D_EDIT, 'refresh');
    },
    wasNativeRestored: () => !!g.SOMASS_RESTORED_FROM_STORAGE,
    getFlags: () => ({ restoreFailed: !!g.SOMASS_RESTORE_FAILED, storageUnavailable: !!g.SOMASS_STORAGE_UNAVAILABLE || storageAccessFailed }),
    onChange: state => document.dispatchEvent(new CustomEvent('somass:versions-change', { detail: state })),
    onNotice: message => toast(message) });
  g.SOMASS_VERSIONS = engine;
  persist = function () {
    const nativeSaved = originalPersist(); if (!nativeSaved) return false;
    try { return engine.captureCurrent(); }
    catch (problem) {
      const status = document.getElementById('projectSaveStatus');
      if (status) { status.textContent = 'Sürüm kaydedilemedi · açık plan korunuyor'; status.classList.add('save-error'); }
      toast(problem.message); return false;
    }
  };
  if (originalImport) deleteConfirmImport = function (next) {
    if (g.SOMASS_RESTORE_FAILED || g.SOMASS_STORAGE_UNAVAILABLE) {
      originalImport(next);
      try { engine.saveCurrent(next.name || 'Açılan plan'); } catch (problem) { toast(problem.message); }
      return;
    }
    try {
      engine.importPlan(next, next.name || 'Açılan plan');
      document.getElementById('exportDialog')?.close();
      toast('Plan ayrı bir sürüm olarak açıldı. Önceki tasarım sürüm listesinde korunuyor.');
    } catch (problem) { toast(problem.message); }
  };
  g.addEventListener?.('storage', event => {
    if (event.key === null || event.key.startsWith((g.SOMASS_STATIC_SITE?.storageKey || STORAGE) + '::design-versions:v1:')) engine.refresh();
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
