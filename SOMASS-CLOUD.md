# SOMASS design storage

The editor at `https://baharercili.github.io/somass/editor/` starts with two independent published designs. “İleriye dönük tasarım” is the initial active design on a fresh browser. Existing local work and the active local version always take precedence over the published starting designs.

Sign in through the cloud button with the same email address on each device. Both named versions are saved together to the authenticated user's private Supabase workspace. The app retains local copies while offline and retries pending writes after reconnection. This is account-based storage: another email address gets a separate workspace.

Every successful cloud revision also creates an immutable database snapshot. A compare-and-swap revision check prevents one device from silently replacing another device's edits. Conflicts pause automatic writes and offer an explicit merge that keeps both copies. JSON export remains available as a portable backup.

Apply `supabase/migrations/20261124_somass_designs.sql` as the database owner before enabling cloud access. The migration is repeat-safe, checks for unrelated table name collisions, enables owner-scoped RLS and creates the `somass_save_bundle` RPC. Existing `somass_customers` data and policies are untouched. Unauthenticated requests cannot read or write design tables. The browser contains only a public publishable key, never a secret or service-role key.

The Supabase project is `kjjgsikkkgnrlanhfqum`. Its authentication redirect allowlist includes the exact editor URL above; the existing room-planner redirect is preserved. The free default email service uses a one-time sign-in link. OTP input is disabled unless a future custom SMTP template is configured and `otpEnabled` is explicitly enabled in `cloud-config.js`.

The official Supabase JS SDK is pinned to version 2.119.2, vendored with its MIT license. Source updates use the existing verified SOMASS overlay and strict build pipeline. The combined Pages workflow and all SOFF/collection sources are preserved.

Code and published starting designs are versioned in GitHub. Subsequent editing sessions are saved to Supabase after account sign-in; they do not rewrite the repository's public starting designs automatically.
