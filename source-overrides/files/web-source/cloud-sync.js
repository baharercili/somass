/* Private, authenticated cloud snapshots. Browser-local versions remain the offline copy. */
(function (g) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  function ordered(value) {
    if (Array.isArray(value)) return value.map(ordered);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]));
    return value;
  }
  function planSignature(plan) {
    const value = clone(plan); delete value.projectUpdatedAt; return JSON.stringify(ordered(value));
  }
  function bundleSignature(bundle) {
    return JSON.stringify(ordered({ activeId: bundle.activeId,
      versions: bundle.versions.map(v => ({ id: v.id, name: v.name, plan: JSON.parse(planSignature(v.plan)) })).sort((a, b) => a.id.localeCompare(b.id)) }));
  }
  function checkedRemote(row) {
    if (!row || !Number.isSafeInteger(row.revision) || row.revision < 1 || row.bundle?.format !== 'somass-design-versions'
      || row.bundle.schemaVersion !== 1 || !Array.isArray(row.bundle.versions) || !row.bundle.versions.length
      || row.bundle.versions.length > 30 || !row.bundle.versions.some(v => v.id === row.bundle.activeId)) {
      throw Error('Buluttaki kayıt okunamadı. Bu cihazdaki çalışmaların korunuyor.');
    }
    const ids = new Set();
    for (const v of row.bundle.versions) {
      if (typeof v.id !== 'string' || ids.has(v.id) || typeof v.name !== 'string' || !v.plan || !Array.isArray(v.plan.objects) || !Array.isArray(v.plan.walls)) {
        throw Error('Buluttaki sürüm bilgisi geçersiz. Bu cihazdaki çalışmaların korunuyor.');
      }
      ids.add(v.id);
    }
    const result = clone(row);
    if (!Number.isFinite(Date.parse(result.updated_at))) result.updated_at = null;
    return result;
  }
  function mergeBundles(local, incoming, makeId, now) {
    const result = clone(local), entries = result.versions;
    const uniqueName = name => {
      const names = new Set(entries.map(v => v.name.toLocaleLowerCase('tr-TR')));
      let value = name.slice(0, 80), n = 2;
      while (names.has(value.toLocaleLowerCase('tr-TR'))) { const suffix = ' (' + n++ + ')'; value = name.slice(0, 80 - suffix.length) + suffix; }
      return value;
    };
    for (const bundle of incoming) for (const v of bundle.versions) {
      const sameId = entries.find(e => e.id === v.id);
      if (sameId && sameId.name === v.name && planSignature(sameId.plan) === planSignature(v.plan)) continue;
      // A retry of the same merge must not grow another copy of an unchanged plan.
      if (entries.some(e => planSignature(e.plan) === planSignature(v.plan) && (e.name === v.name || e.name.startsWith(v.name.slice(0, 48) + ' ·')))) continue;
      if (entries.length >= 30) throw Error('Birleştirme 30 sürüm sınırını aşıyor. Önce iki yedeği de indir; açık çalışmalar korunuyor.');
      const next = clone(v);
      if (sameId) { next.id = makeId(); next.revision = makeId(); next.name = uniqueName(v.name.slice(0, 48) + ' · diğer cihaz'); next.updatedAt = now(); }
      else next.name = uniqueName(v.name);
      entries.push(next);
    }
    delete result.exportedAt;
    return result;
  }
  function sessionClient(sdk, config, session, fallback) {
    // Bind each request client to the authenticated identity that scheduled it.
    // A later account switch cannot make an old queued write use the new token.
    return session?.access_token ? sdk.createClient(config.url, config.publishableKey,
      { accessToken: async () => session.access_token }) : fallback;
  }
  function resolveWorkspaceKey(context) {
    const storageKey = context.storageKey || 'somass-private-workspace:v1';
    const hash = context.hash || '', incoming = /^#work=([a-f0-9]{64})$/.exec(hash);
    if (hash.startsWith('#work=') && !incoming) throw Error('Ortak çalışma bağlantısı geçersiz. Açık tasarımın değiştirilmedi.');
    const raw = context.storage.getItem(storageKey);
    let saved = null;
    if (raw !== null) {
      try { saved = JSON.parse(raw); } catch (_) { throw Error('Ortak çalışma bağlantısı bu cihazdan okunamadı. Bağlantı yedeğini kullanabilirsin.'); }
      if (!saved || !/^[a-f0-9]{64}$/.test(saved.current) || (saved.draftWorkspaceKey !== undefined && !/^[a-f0-9]{64}$/.test(saved.draftWorkspaceKey)) || !Array.isArray(saved.previous)
        || saved.previous.some(key => !/^[a-f0-9]{64}$/.test(key))) throw Error('Ortak çalışma bağlantısı kaydı okunamadı. Bağlantı yedeğini kullanabilirsin.');
    }
    let key = incoming?.[1] || saved?.current;
    if (!key) {
      const bytes = new Uint8Array(32); context.crypto.getRandomValues(bytes);
      key = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    const previous = [...(saved?.previous || [])];
    if (saved?.current && saved.current !== key && !previous.includes(saved.current)) previous.push(saved.current);
    const draftWorkspaceKey = saved?.draftWorkspaceKey || saved?.current || key;
    const record = JSON.stringify({ current: key, previous, draftWorkspaceKey });
    context.storage.setItem(storageKey, record);
    if (context.storage.getItem(storageKey) !== record) throw Error('Ortak çalışma bağlantısı bu cihazda saklanamadı. Tasarımın değiştirilmedi.');
    return { key, changedWorkspace: !!saved?.current && saved.current !== key, foreignDraft: draftWorkspaceKey !== key, incoming: !!incoming };
  }
  function acknowledgeWorkspaceDraft(storage, storageKey, key) {
    const raw = storage.getItem(storageKey), saved = JSON.parse(raw || 'null');
    if (!saved || saved.current !== key || !Array.isArray(saved.previous)) throw Error('Ortak çalışma bağlantısı değiştirilmiş. Açık çalışma korunuyor.');
    const next = JSON.stringify({ ...saved, draftWorkspaceKey: key });
    storage.setItem(storageKey, next);
    if (storage.getItem(storageKey) !== next) throw Error('Ortak çalışma bağlantısı bu cihazda saklanamadı.');
  }
  function createAnonymousSessionManager(auth, options = {}) {
    let inFlight = null;
    const wait = options.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    const maxAttempts = options.maxAttempts || 3;
    function ensureSession() {
      if (inFlight) return inFlight;
      inFlight = Promise.resolve().then(async () => {
        try {
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (options.isOnline?.() === false) throw Error('İnternet bekleniyor. Açık çalışma bu cihazda korunuyor.');
            try {
              const existing = await auth.getSession();
              if (existing.error) throw existing.error;
              if (existing.data?.session?.user?.id && existing.data.session.access_token) return existing.data.session;
              const created = await auth.signInAnonymously();
              if (created.error || !created.data?.session?.user?.id || !created.data.session.access_token) throw created.error || Error('session unavailable');
              return created.data.session;
            } catch (_) {
              if (attempt + 1 === maxAttempts) throw Error('Ortak kayda bağlanılamadı. Açık çalışma korunuyor; yeniden deneyebilirsin.');
              await wait(Math.min(1000 * (2 ** attempt), 4000));
            }
          }
        } finally { inFlight = null; }
      });
      return inFlight;
    }
    return { ensureSession };
  }
  function createController(context) {
    const engine = context.engine, projectKey = context.projectKey || 'somass-showroom';
    const later = context.setTimeout || setTimeout, cancel = context.clearTimeout || clearTimeout;
    const now = context.now || (() => new Date().toISOString());
    const makeId = context.makeId || (() => g.crypto.randomUUID());
    const online = context.isOnline || (() => g.navigator?.onLine !== false);
    let session = null, userId = null, client = context.client, generation = 0, running = null, timer = null;
    let disposed = false, suppressed = 0, loaded = false, revision = null, acknowledged = null, pending = null, conflict = null;
    let state = { phase: 'signed-out', message: '', email: '', lastSaved: null, conflict: false, pending: false };
    const prefix = 'somass-cloud:v1:' + projectKey + ':';
    const metaKey = id => prefix + id + ':state', ownerKey = prefix + 'last-owner';
    let ownerMismatch = false, metadataStorageProblem = false, localOwner = read(ownerKey), foreignWorkspacePending = context.foreignWorkspace === true;
    function read(key) { try { return JSON.parse(context.storage?.getItem(key) || 'null'); } catch (_) { return null; } }
    function store(key, value) {
      try { if (!context.storage) return false; context.storage.setItem(key, JSON.stringify(value)); return true; }
      catch (_) { return false; }
    }
    function persistMeta() {
      if (!userId) return;
      const saved = store(metaKey(userId), { revision, signature: acknowledged, pending, lastSaved: state.lastSaved });
      if (!ownerMismatch) localOwner = userId;
      const ownerSaved = ownerMismatch || store(ownerKey, userId);
      metadataStorageProblem = !saved || !ownerSaved;
    }
    function getState() {
      let localWarning = metadataStorageProblem;
      try { const local = engine.getState?.(); localWarning = localWarning || local?.ready === false || !!local?.error; }
      catch (_) { localWarning = true; }
      return clone({ ...state, localWarning, conflict: !!conflict, remoteAvailable: !!conflict?.row?.bundle, signedIn: !!userId, pending: !!pending || state.phase === 'pending' });
    }
    function emit(phase, message = '') {
      state = { ...state, phase, message }; context.onState?.(getState());
    }
    function snap() {
      let bundle = engine.snapshot();
      if (!bundle.versions.length) { suppressed++; try { engine.saveCurrent('Mevcut tasarım'); } finally { suppressed--; } bundle = engine.snapshot(); }
      if (!bundle.versions.length || !bundle.activeId) throw Error('Önce açık tasarımını kaydet. Bu cihazdaki çalışma korunuyor.');
      return bundle;
    }
    function valid(token) { return !disposed && !!userId && token === generation; }
    function queue(delay = context.debounceMs ?? 2500, refresh = false) {
      if (disposed || !userId || conflict) return;
      if (timer !== null) cancel(timer);
      timer = later(() => { timer = null; syncNow({ refresh }); }, delay);
    }
    function remoteConflict(row, reason) {
      conflict = { row: clone(row), reason }; loaded = true;
      emit('conflict', reason || 'Başka bir cihazda farklı çalışma var. İki çalışmayı da koruyarak birleştir.');
    }
    function remember(row, signature) {
      revision = row.revision; acknowledged = signature;
      foreignWorkspacePending = false;
      state.lastSaved = row.updated_at || now(); loaded = true;
      if (pending?.signature === signature) pending = null;
      persistMeta();
      try { context.onScopeAccepted?.(); } catch (_) { metadataStorageProblem = true; }
    }
    async function loadRemote(token) {
      const guard = engine.snapshotFingerprint(), start = snap(), startSignature = bundleSignature(start);
      emit('loading');
      const { data, error } = context.readRemote ? await context.readRemote(client)
        : await client.from('somass_design_projects').select('bundle,revision,updated_at').eq('project_key', projectKey).maybeSingle();
      if (!valid(token)) return;
      if (error) throw Error('Bulut kaydı okunamadı. Bu cihazdaki çalışmaların korunuyor; bağlantı kurulunca yeniden denenecek.');
      if (data === null || (data?.revision === 0 && data.bundle === null)) {
        if (ownerMismatch) { remoteConflict(null, 'Bu tarayıcıda başka bir hesaba ait çalışma olabilir. Yedekleri koruyup bu hesaba aktarabilirsin.'); return; }
        revision = 0; acknowledged = null; loaded = true; return;
      }
      const row = checkedRemote(data), remoteSignature = bundleSignature(row.bundle), local = snap(), localSignature = bundleSignature(local);
      if (remoteSignature === localSignature) {
        pending = null; ownerMismatch = false; remember(row, localSignature); return;
      }
      if (!ownerMismatch && pending?.signature === remoteSignature) { pending = null; remember(row, remoteSignature); return; }
      if (!ownerMismatch && acknowledged === remoteSignature) { revision = row.revision; loaded = true; persistMeta(); return; }
      const pristine = context.seedBundle && bundleSignature(context.seedBundle) === startSignature;
      const clean = !ownerMismatch && (acknowledged === startSignature || pristine);
      if (clean && guard === engine.snapshotFingerprint() && startSignature === localSignature && !pending) {
        suppressed++;
        try { engine.hydrate(row.bundle, { expectedFingerprint: guard }); }
        finally { suppressed--; }
        ownerMismatch = false; remember(row, bundleSignature(snap())); return;
      }
      remoteConflict(row);
    }
    async function saveDirty(token) {
      if (!valid(token) || conflict || revision === null) return;
      const bundle = snap(), signature = bundleSignature(bundle);
      if (!pending && signature === acknowledged) { emit('synced'); return; }
      if (!pending) {
        pending = { mutationId: makeId(), expectedRevision: revision, signature, bundle: clone(bundle) };
        persistMeta();
      }
      const request = clone(pending);
      emit('saving');
      const parameters = {
        p_project_key: projectKey, p_expected_revision: request.expectedRevision,
        p_mutation_id: request.mutationId, p_bundle: request.bundle
      };
      const { data, error } = context.saveRemote ? await context.saveRemote(client, parameters) : await client.rpc('somass_save_bundle', parameters);
      if (!valid(token)) return;
      if (error) throw Error('Bulut bağlantısı tamamlanamadı. Çalışman bu cihazda kayıtlı; yeniden denenecek.');
      if (data?.status === 'conflict') { remoteConflict(checkedRemote(data)); return; }
      if (data?.status !== 'saved') throw Error('Buluttan kayıt onayı alınamadı. Çalışman bu cihazda korunuyor.');
      const row = checkedRemote(data);
      if (bundleSignature(row.bundle) !== request.signature) throw Error('Bulut kayıt onayı farklı bir çalışma içeriyor. Bu cihazdaki kayıt korunuyor.');
      pending = null; ownerMismatch = false; remember(row, request.signature);
      const stillDirty = bundleSignature(snap()) !== acknowledged;
      emit(stillDirty ? 'pending' : 'synced'); if (stillDirty) queue();
    }
    async function syncNow(options = {}) {
      if (disposed || !userId) { emit('signed-out'); return false; }
      if (!online()) { emit('offline'); return false; }
      if (conflict) { emit('conflict', conflict.reason); return false; }
      if (running) return running;
      const token = generation;
      running = (async () => {
        try {
          if (!loaded || options.refresh) await loadRemote(token);
          if (valid(token) && loaded && !conflict) await saveDirty(token);
          return valid(token) && !conflict && state.phase === 'synced';
        } catch (problem) {
          if (valid(token)) { emit(online() ? 'error' : 'offline', problem.message || 'Bulut bağlantısı kurulamadı. Çalışman bu cihazda korunuyor.'); queue(context.retryMs ?? 15000, true); }
          return false;
        } finally { if (token === generation) running = null; }
      })();
      return running;
    }
    async function setSession(next) {
      // Cloud identity belongs to the shared workspace, while request clients use
      // the real Supabase user/token. Recreated anonymous users keep the same scope.
      const nextId = next?.user?.id ? next.scopeId || next.workspaceId || next.user.id : null;
      if (nextId === userId && nextId) { session = next; client = context.forSession?.(next) || context.client; return syncNow(); }
      generation++; if (timer !== null) cancel(timer); timer = null;
      session = next || null; userId = nextId; client = context.forSession?.(next) || context.client;
      loaded = false; running = null; conflict = null; revision = null; acknowledged = null; pending = null;
      metadataStorageProblem = false;
      state = { phase: 'signed-out', message: '', email: next?.user?.email || '', lastSaved: null, conflict: false, pending: false };
      if (!userId) { emit('signed-out'); return false; }
      const meta = read(metaKey(userId));
      if (meta && Number.isSafeInteger(meta.revision) && meta.revision >= 0 && typeof meta.signature === 'string') {
        revision = meta.revision; acknowledged = meta.signature; state.lastSaved = Number.isFinite(Date.parse(meta.lastSaved)) ? meta.lastSaved : null;
      }
      if (meta?.pending && typeof meta.pending.mutationId === 'string' && Number.isSafeInteger(meta.pending.expectedRevision)
        && typeof meta.pending.signature === 'string' && meta.pending.bundle?.versions?.length) pending = clone(meta.pending);
      const owner = typeof localOwner === 'string' ? localOwner : read(ownerKey);
      ownerMismatch = (typeof owner === 'string' && owner !== userId) || foreignWorkspacePending;
      // Bind the local draft before the first network request (also while offline).
      // Otherwise an account switch during that request could upload it elsewhere.
      if (!owner) { localOwner = userId; metadataStorageProblem = !store(ownerKey, userId); }
      return syncNow();
    }
    function markDirty() {
      if (suppressed || disposed) return;
      if (!userId) { emit('signed-out'); return; }
      if (conflict) return;
      emit(online() ? 'pending' : 'offline'); queue();
    }
    async function mergeConflict() {
      if (!conflict || !userId) return false;
      const selected = clone(conflict), guard = engine.snapshotFingerprint(), local = snap();
      const incoming = [];
      if (selected.row?.bundle) incoming.push(selected.row.bundle);
      if (pending?.bundle) incoming.push(pending.bundle);
      const merged = mergeBundles(local, incoming, makeId, now);
      suppressed++;
      try { engine.hydrate(merged, { expectedFingerprint: guard }); }
      finally { suppressed--; }
      revision = selected.row?.revision || 0;
      acknowledged = selected.row ? bundleSignature(selected.row.bundle) : null;
      ownerMismatch = false; foreignWorkspacePending = false; conflict = null; pending = null; loaded = true; persistMeta();
      try { context.onScopeAccepted?.(); } catch (_) { metadataStorageProblem = true; }
      emit('pending'); return syncNow();
    }
    function backups() { return { local: clone(snap()), remote: conflict?.row?.bundle ? clone(conflict.row.bundle) : null,
      pending: pending?.bundle ? clone(pending.bundle) : null }; }
    function dispose() { disposed = true; generation++; if (timer !== null) cancel(timer); timer = null; }
    return { getState, setSession, syncNow, markDirty, mergeConflict, backups, dispose };
  }
  const exported = { createController, bundleSignature, mergeBundles, checkedRemote, sessionClient, resolveWorkspaceKey, acknowledgeWorkspaceDraft, createAnonymousSessionManager };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (!g.document) return;

  function init() {
    if (document.getElementById('cloudSyncOpen')) return;
    const config = g.SOMASS_CLOUD_CONFIG, engine = g.SOMASS_VERSIONS, sdk = g.supabase;
    if (!engine?.snapshot || !config?.url || !config.publishableKey || !sdk?.createClient || config.automaticWorkspace === false) return;
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url) || config.publishableKey.startsWith('sb_secret_')) return;
    if (config.publishableKey.startsWith('eyJ')) {
      try { if (JSON.parse(atob(config.publishableKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role !== 'anon') return; }
      catch (_) { return; }
    } else if (!config.publishableKey.startsWith('sb_publishable_')) return;
    const d = document, header = d.querySelector('.header-actions'); if (!header) return;
    const workspaceStorageKey = 'somass-private-workspace:v1:' + (config.projectKey || 'somass-showroom');
    let storage, workspaceKey = null, foreignDraft = false, bootError = '';
    try {
      storage = g.localStorage;
      const resolved = resolveWorkspaceKey({ storage, storageKey: workspaceStorageKey, hash: g.location.hash, crypto: g.crypto });
      workspaceKey = resolved.key; foreignDraft = resolved.foreignDraft;
      // Fragments stay out of HTTP requests. Keeping this private fragment makes
      // ordinary bookmarks/address-bar copies reopen the same team workspace.
      g.history.replaceState(g.history.state, '', g.location.pathname + g.location.search + '#work=' + workspaceKey);
    } catch (_) { bootError = 'Ortak çalışma bağlantısı bu cihazda saklanamadı. Açık tasarımın değiştirilmedi; plan yedeğini indirerek koruyabilirsin.'; }
    const node = (tag, cls, text) => { const el = d.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
    const button = (id, text, cls = '') => { const b = node('button', 'cloud-button ' + cls, text); b.type = 'button'; b.id = id; return b; };
    const open = button('cloudSyncOpen', 'Kayda bağlanılıyor…', 'button secondary cloud-open'); open.setAttribute('aria-haspopup', 'dialog');
    header.insertBefore(open, d.getElementById('projectVersionsOpen') || header.firstChild); d.body.classList.add('automatic-workspace-enabled');
    const dialog = node('dialog', 'cloud-dialog'); dialog.id = 'cloudSyncDialog'; dialog.setAttribute('aria-labelledby', 'cloudTitle');
    const top = node('header', 'cloud-heading'), titleBox = node('div');
    titleBox.append(node('small', 'cloud-eyebrow', 'AYNI TASARIMDA BİRLİKTE ÇALIŞIN'));
    const title = node('h2', '', 'Ortak çalışma'); title.id = 'cloudTitle'; title.tabIndex = -1; titleBox.append(title);
    const close = button('cloudSyncClose', '×', 'cloud-close'); close.setAttribute('aria-label', 'Ortak çalışma penceresini kapat'); top.append(titleBox, close);
    const body = node('div', 'cloud-body'), status = node('p', 'cloud-status'), detail = node('p', 'cloud-detail');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); detail.setAttribute('role', 'status');
    const explain = node('p', 'cloud-explain', 'Bu çalışma bağlantısını açan kişiler aynı tasarım sürümlerini düzenler. İnternet kesilirse çalışman bu cihazda korunur; yeniden bağlanınca ortak kayıtla eşitlenir. Aynı anda farklı değişiklik yapılırsa ikisi de ayrı sürümler olarak korunur.');
    const privacy = node('p', 'cloud-privacy', 'Bu bağlantıya sahip kişiler ortak tasarımı düzenleyebilir. Bağlantıyı yalnızca birlikte çalışacağın kişilerle paylaş.');
    const actions = node('div', 'cloud-workspace-actions');
    const sync = button('cloudSyncNow', 'Şimdi yedekle', 'cloud-primary'), copyLink = button('cloudCopyWorkspace', 'Ortak çalışma bağlantısını kopyala');
    const linkBackup = button('cloudBackupWorkspace', 'Bağlantı yedeğini indir'), localBackup = button('cloudBackupLocal', 'Tüm tasarımların yedeğini indir');
    actions.append(sync, copyLink, linkBackup, localBackup);
    const conflicts = node('section', 'cloud-conflict'); conflicts.hidden = true;
    conflicts.append(node('h3', '', 'İki farklı çalışma korunuyor'), node('p', '', 'Bu cihazdaki açık çalışma ve ortak kayıt farklı. Birleştirme, farklı tasarımları ayrı sürümler olarak ekler; açık tasarımını korur.'));
    const merge = button('cloudMerge', 'İki çalışmayı da koruyarak birleştir', 'cloud-primary'), remoteBackup = button('cloudBackupRemote', 'Ortak kaydın yedeğini indir');
    conflicts.append(merge, remoteBackup);
    const workingBackup = button('cloudBackupWorking', 'Açık planın yedeğini indir'); workingBackup.hidden = true;
    body.append(status, detail, workingBackup, explain, actions, privacy, conflicts); dialog.append(top, body); d.body.append(dialog);
    let controller, authClient = null, sessions = null, busy = false, message = '', workspaceId = null, prefetched = null, connecting = null;
    let connectionPhase = bootError ? 'error' : 'loading', connectionMessage = bootError;
    const labels = { 'signed-out': 'Kayda bağlanılıyor…', loading: 'Kayda bağlanılıyor…', saving: 'Kaydediliyor…', synced: 'Ortak kayıt güncel', pending: 'Kaydediliyor…', offline: 'İnternet bekleniyor · cihazda korunuyor', error: 'Kayıt bekliyor · yeniden denenecek', conflict: 'İki farklı çalışma var' };
    function getState() {
      const state = controller?.getState() || { phase: 'signed-out', signedIn: false, lastSaved: null, localWarning: false };
      return { ...state, ...(connectionPhase ? { phase: connectionPhase, message: connectionMessage } : {}) };
    }
    function render() {
      const state = getState(), label = state.localWarning && state.phase !== 'synced' ? 'Kayıt sorunu · yedek indir' : labels[state.phase] || 'Kaydediliyor…';
      open.textContent = label; open.dataset.state = state.phase; status.textContent = label;
      detail.textContent = message || state.message || (state.lastSaved ? 'Son ortak kayıt: ' + new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(state.lastSaved)) : 'Ortak kayıt onayı henüz alınmadı.');
      if (state.localWarning) detail.textContent += ' Bu cihazdaki kayıt alanında sorun var. Açık planının yedeğini indirerek ayrıca koruyabilirsin.';
      workingBackup.hidden = !state.localWarning && !bootError;
      conflicts.hidden = !state.conflict;
      sync.disabled = busy || state.phase === 'saving' || state.phase === 'loading' || state.conflict;
      merge.disabled = busy; copyLink.disabled = linkBackup.disabled = !workspaceKey; remoteBackup.disabled = !state.remoteAvailable;
    }
    if (workspaceKey) {
      try {
        authClient = sdk.createClient(config.url, config.publishableKey, { auth: { storageKey: 'somass-cloud-auth-' + (config.projectKey || 'somass-showroom'), persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' } });
        sessions = createAnonymousSessionManager(authClient.auth, { isOnline: () => g.navigator.onLine !== false });
      } catch (_) { bootError = connectionMessage = 'Ortak kayda bağlanılamadı. Açık çalışma bu cihazda korunuyor.'; connectionPhase = 'error'; }
    }
    let foreignWorkspace = false;
    if (foreignDraft) {
      try { foreignWorkspace = !g.SOMASS_PUBLISHED_DESIGNS || bundleSignature(engine.snapshot()) !== bundleSignature(g.SOMASS_PUBLISHED_DESIGNS); }
      catch (_) { foreignWorkspace = true; }
    }
    controller = createController({ engine, client: authClient, storage, projectKey: config.projectKey, seedBundle: g.SOMASS_PUBLISHED_DESIGNS, foreignWorkspace,
      onState: render, onScopeAccepted: () => acknowledgeWorkspaceDraft(storage, workspaceStorageKey, workspaceKey),
      forSession: session => sessionClient(sdk, config, session, authClient),
      readRemote: client => {
        if (prefetched) { const row = prefetched; prefetched = null; return Promise.resolve({ data: row, error: null }); }
        return client.rpc('somass_workspace_read', { p_workspace_key: workspaceKey });
      },
      saveRemote: (client, args) => client.rpc('somass_workspace_save', { p_workspace_key: workspaceKey,
        p_expected_revision: args.p_expected_revision, p_mutation_id: args.p_mutation_id, p_bundle: args.p_bundle })
    });
    async function connect() {
      if (connecting) return connecting;
      if (!workspaceKey || !authClient || !sessions) { connectionPhase = 'error'; connectionMessage = bootError; render(); return false; }
      connectionPhase = g.navigator.onLine === false ? 'offline' : 'loading'; connectionMessage = ''; render();
      connecting = Promise.resolve().then(async () => {
        try {
          const session = await sessions.ensureSession(), client = sessionClient(sdk, config, session, authClient);
          const { data, error } = await client.rpc('somass_workspace_read', { p_workspace_key: workspaceKey });
          if (error || !data || typeof data.workspace_id !== 'string' || !/^[a-f0-9-]{36}$/.test(data.workspace_id)
            || !Number.isSafeInteger(data.revision) || data.revision < 0 || (data.revision === 0 && data.bundle !== null)) {
            throw Error('Ortak kayıt okunamadı. Açık çalışma bu cihazda korunuyor; yeniden deneyebilirsin.');
          }
          workspaceId = data.workspace_id; prefetched = data; connectionPhase = null; connectionMessage = '';
          await controller.setSession({ ...session, scopeId: workspaceId }); render(); return controller.getState().phase === 'synced';
        } catch (problem) {
          connectionPhase = g.navigator.onLine === false ? 'offline' : 'error'; connectionMessage = problem.message || 'Ortak kayda bağlanılamadı. Açık çalışma bu cihazda korunuyor.'; render(); return false;
        } finally { connecting = null; }
      });
      return connecting;
    }
    async function syncNow(options = {}) {
      if (!workspaceId || !controller.getState().signedIn || connectionPhase) return connect();
      return controller.syncNow(options);
    }
    g.SOMASS_CLOUD = { ...controller, getState, syncNow };
    async function act(fn) {
      if (busy) return; busy = true; message = ''; render();
      try { await fn(); } catch (e) { message = e.message || 'İşlem tamamlanamadı. Açık çalışma bu cihazda korunuyor.'; }
      finally { busy = false; render(); }
    }
    function download(value, name) {
      const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = d.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    const stamp = () => new Date().toISOString().slice(0, 10);
    const workLink = () => g.location.origin + g.location.pathname + '#work=' + workspaceKey;
    open.onclick = () => { dialog.showModal(); render(); title.focus(); };
    close.onclick = () => { dialog.close(); open.focus(); };
    sync.onclick = () => act(() => syncNow({ refresh: true }));
    merge.onclick = () => act(() => controller.mergeConflict());
    localBackup.onclick = () => act(() => download({ ...controller.backups().local, exportedAt: new Date().toISOString() }, 'somass-tasarim-surumleri-' + stamp() + '.json'));
    remoteBackup.onclick = () => act(() => download({ ...controller.backups().remote, exportedAt: new Date().toISOString() }, 'somass-ortak-kayit-' + stamp() + '.json'));
    workingBackup.onclick = () => d.getElementById('exportJson')?.click();
    copyLink.onclick = () => act(async () => {
      if (!workspaceKey) return;
      try { await g.navigator.clipboard.writeText(workLink()); message = 'Ortak çalışma bağlantısı kopyalandı. Ekip arkadaşlarınla bu bağlantıyı paylaşabilirsin.'; }
      catch (_) { message = 'Bağlantıyı adres çubuğundan kopyalayabilir veya bağlantı yedeğini indirebilirsin.'; }
    });
    linkBackup.onclick = () => {
      if (workspaceKey) download({ format: 'somass-private-workspace-link', schemaVersion: 1, url: workLink(), createdAt: new Date().toISOString() }, 'SOMASS_Ortak_Calisma_Baglantisi_' + stamp() + '.json');
    };
    d.addEventListener('somass:versions-change', () => controller.markDirty());
    g.addEventListener('online', () => syncNow({ refresh: true }));
    g.addEventListener('offline', () => { if (!workspaceId) connectionPhase = 'offline'; controller.markDirty(); render(); });
    d.addEventListener('visibilitychange', () => { if (!d.hidden) syncNow({ refresh: true }); });
    if (authClient) authClient.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        if (connecting) return;
        if (session?.user?.id && workspaceId) controller.setSession({ ...session, scopeId: workspaceId });
        else if (!session?.user?.id) controller.setSession(null).then(() => connect());
      }, 0);
    });
    setInterval(() => { if (!d.hidden && workspaceId && !connectionPhase) controller.syncNow({ refresh: true }); }, 20000);
    render(); connect();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
