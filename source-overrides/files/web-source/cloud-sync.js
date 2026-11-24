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
    let ownerMismatch = false, metadataStorageProblem = false, localOwner = read(ownerKey);
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
      state.lastSaved = row.updated_at || now(); loaded = true;
      if (pending?.signature === signature) pending = null;
      persistMeta();
    }
    async function loadRemote(token) {
      const guard = engine.snapshotFingerprint(), start = snap(), startSignature = bundleSignature(start);
      emit('loading');
      const { data, error } = await client.from('somass_design_projects').select('bundle,revision,updated_at').eq('project_key', projectKey).maybeSingle();
      if (!valid(token)) return;
      if (error) throw Error('Bulut kaydı okunamadı. Bu cihazdaki çalışmaların korunuyor; bağlantı kurulunca yeniden denenecek.');
      if (data === null) {
        if (ownerMismatch) { remoteConflict(null, 'Bu tarayıcıda başka bir hesaba ait çalışma olabilir. Yedekleri koruyup bu hesaba aktarabilirsin.'); return; }
        revision = 0; acknowledged = null; loaded = true; return;
      }
      const row = checkedRemote(data), remoteSignature = bundleSignature(row.bundle), local = snap(), localSignature = bundleSignature(local);
      if (remoteSignature === localSignature) {
        pending = null; ownerMismatch = false; remember(row, localSignature); return;
      }
      if (pending?.signature === remoteSignature) { pending = null; ownerMismatch = false; remember(row, remoteSignature); return; }
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
      const { data, error } = await client.rpc('somass_save_bundle', {
        p_project_key: projectKey, p_expected_revision: request.expectedRevision,
        p_mutation_id: request.mutationId, p_bundle: request.bundle
      });
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
      const nextId = next?.user?.id || null;
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
      ownerMismatch = typeof owner === 'string' && owner !== userId;
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
      ownerMismatch = false; conflict = null; pending = null; loaded = true; persistMeta();
      emit('pending'); return syncNow();
    }
    function backups() { return { local: clone(snap()), remote: conflict?.row?.bundle ? clone(conflict.row.bundle) : null,
      pending: pending?.bundle ? clone(pending.bundle) : null }; }
    function dispose() { disposed = true; generation++; if (timer !== null) cancel(timer); timer = null; }
    return { getState, setSession, syncNow, markDirty, mergeConflict, backups, dispose };
  }
  const exported = { createController, bundleSignature, mergeBundles, checkedRemote, sessionClient };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (!g.document) return;

  function init() {
    if (document.getElementById('cloudSyncOpen')) return;
    const config = g.SOMASS_CLOUD_CONFIG, engine = g.SOMASS_VERSIONS, sdk = g.supabase;
    if (!engine?.snapshot || !config?.url || !config.publishableKey || !sdk?.createClient) return;
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url) || config.publishableKey.startsWith('sb_secret_')) return;
    // Only a publishable / legacy anon credential belongs in the public browser app.
    if (config.publishableKey.startsWith('eyJ')) {
      try { if (JSON.parse(atob(config.publishableKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role !== 'anon') return; }
      catch (_) { return; }
    } else if (!config.publishableKey.startsWith('sb_publishable_')) return;
    const d = document, header = d.querySelector('.header-actions'); if (!header) return;
    const node = (tag, cls, text) => { const el = d.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
    const button = (id, text, cls = '') => { const b = node('button', 'cloud-button ' + cls, text); b.type = 'button'; b.id = id; return b; };
    const open = button('cloudSyncOpen', 'Bulut kaydı', 'button secondary cloud-open'); open.setAttribute('aria-haspopup', 'dialog');
    header.insertBefore(open, d.getElementById('projectVersionsOpen') || header.firstChild);
    const dialog = node('dialog', 'cloud-dialog'); dialog.id = 'cloudSyncDialog'; dialog.setAttribute('aria-labelledby', 'cloudTitle');
    const top = node('header', 'cloud-heading'), titleBox = node('div');
    titleBox.append(node('small', 'cloud-eyebrow', 'ÇALIŞMALARIN KORUNSUN'));
    const title = node('h2', '', 'Bulut kaydı'); title.id = 'cloudTitle'; title.tabIndex = -1; titleBox.append(title);
    const close = button('cloudSyncClose', '×', 'cloud-close'); close.setAttribute('aria-label', 'Bulut kaydı penceresini kapat'); top.append(titleBox, close);
    const body = node('div', 'cloud-body'), status = node('p', 'cloud-status'), detail = node('p', 'cloud-detail');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); detail.setAttribute('role', 'status');
    const explain = node('p', 'cloud-explain', 'Tasarım sürümlerin hesabında birlikte saklanır. Başka cihazda aynı e-posta adresiyle giriş yaparak devam edebilirsin. İnternet kesilirse açık çalışman bu cihazda korunur.');
    const form = node('form', 'cloud-login'), label = node('label', '', 'E-posta adresin'), email = node('input');
    email.id = 'cloudEmail'; email.type = 'email'; email.required = true; email.autocomplete = 'email'; label.htmlFor = email.id;
    const otpEnabled = config.otpEnabled === true;
    const send = button('cloudSendLink', otpEnabled ? 'Giriş bağlantısı ve kod gönder' : 'E-postayla giriş bağlantısı gönder', 'cloud-primary'); send.type = 'submit';
    form.append(label, email, send); const loginHelp = node('p', 'cloud-detail', otpEnabled
      ? 'Şifre gerekmez. E-postandaki kodu aşağıya yaz veya bağlantıyı çalışacağın tarayıcıda aç.'
      : 'Şifre gerekmez. E-postandaki bağlantıyı çalışma yapacağın tarayıcıda aç.'); form.append(loginHelp);
    const otpForm = node('form', 'cloud-login cloud-otp'); otpForm.hidden = true;
    const otpLabel = node('label', '', 'E-postana gelen giriş kodu'), otp = node('input');
    otp.id = 'cloudEmailCode'; otp.type = 'text'; otp.inputMode = 'numeric'; otp.autocomplete = 'one-time-code';
    otp.pattern = '[0-9]{6,10}'; otp.maxLength = 10; otp.required = true; otpLabel.htmlFor = otp.id;
    const verify = button('cloudVerifyCode', 'Kodu doğrula ve giriş yap', 'cloud-primary'); verify.type = 'submit'; otpForm.append(otpLabel, otp, verify);
    const account = node('div', 'cloud-account'), accountText = node('p');
    const sync = button('cloudSyncNow', 'Şimdi kaydet', 'cloud-primary'), logout = button('cloudSignOut', 'Hesaptan çık', 'cloud-quiet');
    account.append(accountText, sync, logout);
    const conflicts = node('section', 'cloud-conflict'); conflicts.hidden = true;
    conflicts.append(node('h3', '', 'İki farklı çalışma korunuyor'), node('p', '', 'Bu cihazdaki açık çalışma ve buluttaki çalışma farklı. Birleştirme, farklı tasarımları ayrı sürümler olarak ekler; açık tasarımını korur.'));
    const merge = button('cloudMerge', 'İki çalışmayı da koruyarak birleştir', 'cloud-primary');
    const localBackup = button('cloudBackupLocal', 'Bu cihazın yedeğini indir'), remoteBackup = button('cloudBackupRemote', 'Buluttaki yedeği indir');
    const workingBackup = button('cloudBackupWorking', 'Açık planın yedeğini indir'); workingBackup.hidden = true;
    conflicts.append(merge, localBackup, remoteBackup); body.append(status, detail, workingBackup, explain, form, otpForm, account, conflicts); dialog.append(top, body); d.body.append(dialog);
    let authClient, controller, busy = false, message = '', otpEmail = '';
    try {
      authClient = sdk.createClient(config.url, config.publishableKey, { auth: { storageKey: 'somass-cloud-auth-' + (config.projectKey || 'somass-showroom'), persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' } });
    } catch (_) { open.remove(); dialog.remove(); return; }
    const labels = { 'signed-out': 'Bu cihazda · giriş yap', loading: 'Bulut kontrol ediliyor…', saving: 'Buluta kaydediliyor…', synced: 'Buluta kaydedildi', pending: 'Bulut kaydı bekliyor', offline: 'Çevrimdışı · cihazda kayıtlı', error: 'Cihazda kayıtlı · yeniden denenecek', conflict: 'İki farklı çalışma var' };
    function render(state) {
      const label = state.localWarning && state.phase !== 'synced' ? 'Kayıt sorunu · yedek indir' : labels[state.phase] || 'Bulut kaydı';
      open.textContent = label; open.dataset.state = state.phase;
      status.textContent = label; detail.textContent = message || state.message || (state.lastSaved ? 'Son bulut kaydı: ' + new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(state.lastSaved)) : '');
      if (state.localWarning) detail.textContent += ' Bu cihazdaki kayıt alanında sorun var. Açık planının yedeğini indirerek ayrıca koruyabilirsin.';
      workingBackup.hidden = !state.localWarning;
      form.hidden = state.signedIn; otpForm.hidden = state.signedIn || !otpEnabled || !otpEmail; account.hidden = !state.signedIn; accountText.textContent = state.email;
      conflicts.hidden = !state.conflict; sync.disabled = busy || state.conflict || state.phase === 'saving' || state.phase === 'loading';
      send.disabled = verify.disabled = busy; logout.disabled = busy; merge.disabled = busy;
      remoteBackup.disabled = !state.remoteAvailable;
    }
    let localStorage;
    try { localStorage = g.localStorage; } catch (_) {}
    controller = createController({ engine, client: authClient, storage: localStorage, projectKey: config.projectKey,
      seedBundle: g.SOMASS_PUBLISHED_DESIGNS, onState: render,
      forSession: session => sessionClient(sdk, config, session, authClient) });
    g.SOMASS_CLOUD = controller;
    async function act(fn) {
      if (busy) return; busy = true; message = ''; render(controller.getState());
      try { await fn(); } catch (e) { message = e.message || 'İşlem tamamlanamadı. Tasarımın bu cihazda korunuyor.'; }
      finally { busy = false; render(controller.getState()); }
    }
    function download(bundle, suffix) {
      if (!bundle) return;
      const blob = new Blob([JSON.stringify({ ...bundle, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = d.createElement('a'); a.href = url; a.download = 'somass-' + suffix + '-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    open.onclick = () => { dialog.showModal(); render(controller.getState()); title.focus(); };
    close.onclick = () => { dialog.close(); open.focus(); };
    form.onsubmit = event => { event.preventDefault(); act(async () => {
      const redirect = new URL(g.location.pathname, g.location.origin).href;
      const { error } = await authClient.auth.signInWithOtp({ email: email.value.trim(), options: { emailRedirectTo: redirect } });
      if (error) throw Error('Giriş bağlantısı gönderilemedi. E-posta adresini kontrol edip yeniden dene.');
      otpEmail = otpEnabled ? email.value.trim() : ''; otp.value = '';
      message = otpEnabled ? 'Giriş e-postası gönderildi. E-postandaki kodu aşağıya yaz veya bağlantıyı çalışacağın tarayıcıda aç.'
        : 'Giriş bağlantısı gönderildi. E-postandaki bağlantıyı çalışma yapacağın tarayıcıda aç.';
    }); };
    otpForm.onsubmit = event => { event.preventDefault(); act(async () => {
      const token = otp.value.trim();
      if (!otpEmail || !/^[0-9]{6,10}$/.test(token)) throw Error('E-postandaki 6–10 haneli giriş kodunu yaz.');
      const { data, error } = await authClient.auth.verifyOtp({ email: otpEmail, token, type: 'email' });
      if (error || !data?.session) throw Error('Kod doğrulanamadı. Son gelen kodu kontrol et veya yeni bir giriş e-postası iste.');
      otp.value = ''; otpEmail = ''; message = '';
      await controller.setSession(data.session);
    }); };
    sync.onclick = () => act(() => controller.syncNow({ refresh: true }));
    merge.onclick = () => act(() => controller.mergeConflict());
    logout.onclick = () => act(async () => { const { error } = await authClient.auth.signOut({ scope: 'local' }); if (error) throw Error('Çıkış tamamlanamadı.'); await controller.setSession(null); });
    localBackup.onclick = () => download(controller.backups().local, 'bu-cihaz-surumleri');
    remoteBackup.onclick = () => download(controller.backups().remote, 'bulut-surumleri');
    workingBackup.onclick = () => d.getElementById('exportJson')?.click();
    d.addEventListener('somass:versions-change', () => controller.markDirty());
    g.addEventListener('online', () => controller.syncNow({ refresh: true }));
    g.addEventListener('offline', () => controller.markDirty());
    d.addEventListener('visibilitychange', () => { if (!d.hidden) controller.syncNow({ refresh: true }); });
    // Do not call Supabase methods while inside its auth-state lock.
    authClient.auth.onAuthStateChange((_event, session) => { setTimeout(() => controller.setSession(session), 0); });
    authClient.auth.getSession().then(({ data, error }) => {
      if (error) { message = 'Bulut oturumu okunamadı. Çalışmaların bu cihazda korunuyor.'; render(controller.getState()); }
      else controller.setSession(data.session);
    });
    setInterval(() => { if (!d.hidden) controller.syncNow({ refresh: true }); }, 20000);
    render(controller.getState());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
