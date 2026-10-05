# Implementation and verification — October 4, 2026

## Fully working and live-tested

No authenticated end-to-end feature meets the requested live completion standard yet. The configured Supabase endpoint is reachable, but its current schema is still broken: an anonymous `conversation_members` query returns HTTP 500, PostgreSQL `42P17`, “infinite recursion detected in policy for relation conversation_members.” The new `app_schema_version` RPC returns HTTP 404/PGRST202 because the new migrations have not been applied.

Two signup attempts were made through the real Supabase Auth API. Both returned HTTP 429, “email rate limit exceeded,” with no user or session. No successful signup, upload, email verification, multi-browser message, or other live feature is claimed.

## Implemented but not live-tested

All items below refer to real-mode code, not the demo shell.

| Area | Implemented behavior |
| --- | --- |
| Real/demo isolation | Lazy-loaded separate applications; real mode never reads the demo identity or social database from localStorage. Supabase manages its own session persistence. Schema gate prevents running on legacy policies. |
| Authentication | Email/password signup/login, confirmation-pending message, persisted session, logout, protected routing, password recovery/update, onboarding redirect, return-route storage. Profile bootstrap remains an auth trigger. |
| Onboarding/profile editing | Username RPC availability, normalized/reserved usernames, display name, avatar Storage upload, bio, website validation, privacy, suggested-user follows, persisted completion. |
| Feed/posts | Ranked server query, bounded pages, IntersectionObserver, refresh, empty/error/loading states, timestamps, carousel media, video controls, mentions/hashtags, location, counts, optimistic likes/saves with rollback, double-click like. |
| Publishing | Multiple images/videos, preview/order/removal, caption/location, alt text, comment/like settings, file-level upload progress, Storage paths, video thumbnails, atomic post/media/reel transaction, failed-upload cleanup. |
| Owner controls | Edit caption/location/comments/hidden likes; confirmed post deletion and owned-media cleanup. Database ownership rules apply independently of UI. |
| Comments | Persisted comments/replies, nested rendering, own deletion, likes/unlikes, timestamps, bounded history, mentions, optimistic insert/rollback, disabled-comment enforcement in RLS. |
| Follows/privacy | Follow/unfollow, pending private requests, accept/decline, remove follower, paginated followers/following, counts, consistent follow state across mounted controls, backend private-content checks. |
| Saves | Private saved page, collections create/rename/delete, post assignment and removal from a collection, saved state restored from database. |
| Stories | Image/video upload, server 24-hour expiry, tray, view tracking, progress, next/previous/auto advance/pause/keyboard controls, likes, DM replies, owner viewers/deletion; expired rows excluded by policy. |
| Reels | Persisted video-backed posts, vertical presentation, viewport playback/pause, native mute controls, interactions, audio title, unique-user view counts, bounded feed, deep links, comments modal. |
| Explore/search | Real media grid and metadata, server ranking with recency/engagement/relationship/light deterministic variation; debounced username/display-name/hashtag queries, server recent-search history/remove/clear, follow controls. |
| Hashtags/mentions | Database triggers parse and persist tags and mentions, clickable routes, hashtag feed, mention notifications, profile tagged-post query. |
| Profiles | Metadata, counts, privacy/verification display, follow/message/edit controls, posts/reels/tagged tabs, private saved link, share link, report/block. |
| Messaging | Paginated inbox/history, explicitly selected conversation, atomic one-to-one creation, groups/title/member management, text/image/video/shared-post/shared-reel/story-reply messages, reply references, reactions, unsend, timestamps, unread/read receipts, search. |
| Realtime | Postgres Changes for message insert/delete, inbox/conversation/membership changes and notifications; authenticated private channels for Presence and debounced expiring typing; cleanup removes subscriptions. |
| Notifications | Stored likes/comments/replies/comment-likes/follows/requests/acceptance/mentions/story interactions, unread badge, read/all-read, entity navigation, preference enforcement. |
| Settings | Profile/privacy, blocked-account removal, password change/logout, destructive account confirmation, owned Storage cleanup followed by deletion of own auth user/cascading rows; persisted theme and notification preferences. |
| Moderation | Reports for profiles/posts/reels/comments/messages, bidirectional blocking rules, follow/request cleanup and backend interaction/chat denial. |
| Navigation/accessibility | History routes, nested-route host rewrites, mobile navigation, semantic labeled controls, native modal focus handling/Escape/restore, reduced-motion styles, alt text, toasts, error boundary. |

## Still incomplete / limitations

- Remote application of migrations 004 and 005 is blocked by missing administrative access. The only configured credential is a browser publishable key; no service-role key is placed in frontend code. No connected Chrome/IAB browser was available to reach a logged-in dashboard.
- Two confirmed real accounts and live cross-browser verification remain unavailable because signup was rate-limited. Email delivery, password recovery links, Realtime authorization/deletion events, actual Storage service behavior, media playback, and visual responsive QA remain unverified.
- Some advanced UI behavior is basic: story tray entries represent individual stories instead of per-person segments, story progress uses a single bar, there are no full-screen mobile tap zones, and mutual followers are not implemented. Story/viewer/suggestion and collection lists use bounded queries; not every auxiliary list has a load-more control.
- Presence currently covers the open conversation. There is no durable last-active timestamp. Reactions persist and are displayed on load, but reaction changes are not subscribed live. Group membership and read receipts refresh through inbox membership events; live behavior still needs testing.
- Publishing shows per-file upload progress, not byte-level or resumable progress. Video thumbnail creation is best effort. Upload content is MIME/size/path validated; there is no media transcoding or malware pipeline.
- Saved posts can belong to one collection, reflecting the existing schema. Share-to-DM currently selects a person, not an existing group; profile sharing is a copied deep link.
- Tagged posts are caption mentions, not arbitrary photo-region user tagging. Global comment permissions beyond each post's comments-enabled toggle are not implemented.
- Account Storage cleanup and auth deletion are separate network operations: a failure between them can leave an existing account with removed media and requires retry. Direct invocation of the deletion RPC does not run Storage cleanup; a server-side deletion job is still preferable for production reliability.
- Signed media links remain valid for up to 120 seconds after issuance. Already downloaded content cannot be recalled. Legacy non-Supabase external post media is rejected instead of silently bypassing private media controls.
- Historical captions/comments are not backfilled into hashtag/mention tables by these migrations. New inserts/edits are indexed. Notification preferences suppress new rows rather than removing history.
- Database types are maintained source contracts, not generated from the inaccessible live database. Production types should be regenerated after applying migrations.

## Database changes

`supabase/migrations/202610030004_secure_features.sql`:

- Replaces legacy policies on the app's named tables, preserving enabled RLS and policies on unrelated tables.
- Adds non-exposed `private` schema helpers for blocks, post/story visibility, ownership, and chat access; secures the existing membership helper without recursive policies.
- Closes arbitrary membership joins, forced accepted private follows, sender spoofing, collection ownership abuse, disabled-comment inserts, verification updates, and private-media access.
- Adds `user_settings`, `recent_searches`, `reel_views`; `post_media.alt_text`; message media/shared-post/story references; access/query indexes.
- Adds direct/group membership RPCs, own-account deletion, content indexing/notification/block/view/activity triggers and reference validation.
- Makes posts/reels/stories/message buckets private, restricts MIME/size/folder ownership, and adds membership-authorized Realtime Presence/Broadcast policies.

`supabase/migrations/202610040005_queries_and_integrity.sql`:

- Adds schema capability check, username availability/normalization/reserved names/case-insensitive uniqueness.
- Adds atomic publishing, batched post statistics, ranked paginated posts, profile reels/tagged posts, and batched unread RPCs.
- Validates post/story/reel media ownership and references; story-reply notifications and shared preference guard.
- Narrows collection update grants; adds interaction indexes and reactions publication.

Both new migrations are transaction-wrapped and were replayed after migrations 001–003 in embedded PostgreSQL. **They are not applied to the remote project.** A deployment with existing case-colliding usernames must resolve those before creating the case-insensitive unique index.

## Runtime issues fixed

- Eliminated configured-mode fake stories, actors, suggestions, counts, notifications and local-auth bypass by routing through a distinct real application.
- Eliminated synthetic post IDs, stale optimistic rollback, mixed-conversation messages, dropped own messages, automatic arbitrary DM creation, and copied-current-page post links in real mode.
- Local database tests caught/fixed an INSERT RETURNING visibility problem and shared-trigger row-field references.
- Confirmed the live recursive-membership failure; the replacement policies pass local membership/isolation tests but cannot be called remotely fixed until deployed.
- Component tests verify failed likes restore their count/state, disabled comments expose no composer, content is not interpreted as HTML, confirmation-pending signup stays unauthenticated, password-reset errors appear, and the migration gate does not trust demo identity.

## Files changed

Major changes: `src/App.tsx`, `src/RealApp.tsx`, `src/DemoApp.tsx`, `src/real.css`, feature modules under `src/features/`, shared components/hooks, `src/services/social.ts`, `src/types/social.ts`, `src/utils/`, Supabase migrations 004/005, test scripts, `tests/runtime.test.tsx`, `vitest.config.ts`, package scripts/dependencies, `.gitignore`, and README.

The workspace has no `.git` repository, so no commit or diff against a VCS baseline was possible.

## Test accounts / test workflow used

- Live: attempted A/B signup with unique `qa_<timestamp>_a` / `_b` names under `example.com`. Both were rejected before account/session creation. Passwords are not included here. Probe results are in ignored `.local/live-results.json`.
- Local: three synthetic UUID identities A/B/C in a fresh embedded PostgreSQL database, exercising the actual migration SQL under `authenticated` roles and `auth.uid()`, with separate identities for owner/follower/outsider. This is database integration testing, not a live Supabase server or real browser session.
- Storage/auth/realtime schemas in the local harness are minimal stand-ins for evaluating SQL/RLS. Storage network APIs, websocket delivery and GoTrue are not simulated as successful production tests.

## Final verification

Commands: `npm run build`, `npm run lint`, `npm run typecheck`, `npm test`.

- Production build and TypeScript diagnostics pass.
- Lint passes without warnings.
- Component suite: 7 passing tests.
- Database security/integration suite: 56 passing assertions, plus the own-follow-request zero-row check.
- Vite HTTP checks returned 200 for nested `/p/:id` and `/direct/:id` paths; this verifies SPA fallback, not interactive behavior.
- Browser console and visual mobile/desktop tests were not run: no browser surface was available.
- Reviewed TODO/FIXME/mock/fake/placeholder occurrences: no unfinished TODO/FIXME in real-mode source; test doubles are in tests only; visual placeholder attributes and explicit no-credentials demo assets remain isolated. No real-mode `dangerouslySetInnerHTML`, browser `alert()`, or authoritative social localStorage use was found.
