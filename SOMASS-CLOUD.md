# SOMASS design storage

The editor at `https://baharercili.github.io/somass/editor/` starts with two independent published designs. “İleriye dönük tasarım” is the initial active design on a fresh browser. Existing local work and the active local version always take precedence over the published starting designs.

Email-free shared workspaces are the default. The app automatically establishes a Supabase guest session and generates a cryptographically random 32-byte workspace capability on first use. Both named designs belong to that shared workspace. Everyone opening the exact same private work link reads and edits the same cloud record. The app retains local copies while offline and retries pending writes after reconnection.

Every successful cloud revision also creates an immutable database snapshot. A compare-and-swap revision check prevents one device from silently replacing another device's edits. Conflicts pause automatic writes and offer an explicit merge that keeps both copies. JSON export remains available as a portable backup.

Apply `supabase/migrations/20261124000100_somass_designs.sql` and then `supabase/migrations/20261124000200_somass_workspaces.sql` as the database owner. They are repeat-safe and check for unrelated table-name collisions. Existing `somass_customers` data and policies are untouched. Owner-only public RLS remains in force. Capability-scoped RPCs additionally require an authenticated guest session and the exact private workspace key. Only its SHA-256 hash is stored by the database. A separate internal project key per workspace prevents two keys created by one guest identity from aliasing the same record. The original owner identity cannot be deleted by guest-account cleanup while its workspace exists.

The 64-hex workspace capability is generated at runtime, never shipped in GitHub configuration. It appears only in the private work link's URL fragment, durable local storage and a user-requested private link backup. Anyone given that link can edit the shared workspace; keep it private and share it only with intended collaborators. A fresh device opening the generic editor address without the private work link creates a separate workspace. The browser contains only a public Supabase publishable key, never a secret or service-role key.

The Supabase project is `kjjgsikkkgnrlanhfqum`. Anonymous Auth is enabled with the user's explicit approval. Existing email confirmation settings, room-planner redirect and customer policy excluding anonymous identities remain unchanged. Email input, sign-in controls and duplicate local/cloud status badges are hidden in automatic workspace mode.

The official Supabase JS SDK is pinned to version 2.119.2, vendored with its MIT license. Source updates use the existing verified SOMASS overlay and strict build pipeline. The combined Pages workflow and all SOFF/collection sources are preserved.

Code and published starting designs are versioned in GitHub. Subsequent editing sessions are automatically saved to the private shared Supabase workspace; they do not rewrite the repository's public starting designs automatically.


## Ortak bağlantı sürümü — 24 Kasım 2026

Bu sürümde bağlantıyı bilen kişiler aynı ortak tasarım/sürüm alanını giriş yapmadan kullanır. Uygulama dosyaları GitHub’da, çalışma kayıtları Supabase’de tutulur. Kişisel hesaplara ait eski tablolar ve kayıtlar ayrı kalır. Tarayıcıdaki eski çalışmalar otomatik paylaşılmaz; kullanıcı, paylaşılacak sürüm listesini inceleyip ortak alana aktarmayı seçer.

Paylaşılan alan `somass_shared_design_projects`, kayıt yöntemi `somass_shared_save_bundle` ve sabit çalışma alanı `5248c66f-a4bc-43df-906b-656960e5ce47` ile sınırlıdır. Güncellemeler beklenen sunucu sürümünü kontrol eder; başka bir cihazın değişikliği sessizce ezilmez. Kaynak başlangıç planı, üretici katalogları ve salt okunur kaynak görünümü değişmez.

Yeni şema: `supabase/migrations/20261124180000_somass_shared_designs.sql`. Aynı Supabase projesinde önce Room Planner ortak alan göçü uygulanmış olmalıdır. Önceki özel hesap/OTP belgeleri yukarıda korunmuştur; varsayılan paylaşılan kullanımda e-posta veya parola gerekmez.
