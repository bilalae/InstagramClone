# Instagram Clone

React + TypeScript social app with an isolated demo and a database-backed real mode. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for the audit, implementation details, test evidence, and remaining limitations. This is not a claim of completed live multi-user verification.

**Current remote blocker:** the configured Supabase project still reports recursive `conversation_members` policies. Apply the pending migrations through `202610040005_queries_and_integrity.sql`. Real mode deliberately displays “Database update required” until `app_schema_version()` returns 5, so it cannot run against the insecure legacy schema.

## Current features

- Responsive Instagram-style desktop and mobile shell
- Supabase Auth integration when environment variables are configured
- Local preview/demo auth fallback when Supabase is not configured
- Home feed, stories, Explore, Reels, profile, notifications, and DMs
- Create post, comments, likes, saves, follows, sharing, and settings interactions
- Supabase schema for profiles, follows, posts/media, comments, stories, reels, conversations/messages, notifications, moderation, hashtags, mentions, and blocks
- Row Level Security policies and storage bucket policies
- Typed Supabase client boundary

## Stack

- React 19 + TypeScript
- Vite
- Supabase Auth, PostgreSQL, Storage, and Realtime
- Lucide React icons

## Supabase setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env`.
3. Set:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

4. Apply all five migrations in order using the Supabase SQL editor or a linked Supabase CLI. Do not rerun already-applied migrations:

   ```bash
   supabase db push
   ```

   The new forward migrations are `202610030004_secure_features.sql` and
   `202610040005_queries_and_integrity.sql`. They replace the legacy policies,
   add private-media access, and provide the RPCs used by real mode. The files
   are transaction-wrapped and are tested against all earlier migrations.

5. Configure email confirmation and password reset URLs in Supabase Authentication settings. For local development, add `http://localhost:5173` and your deployed URL to the allowed redirect URLs.

The migration creates these storage buckets:

- `avatars` (public)
- `posts` (private)
- `reels` (private)
- `stories` (private)
- `messages` (private)

Uploads must use a path beginning with the authenticated user's UUID, for example:
`<user-id>/posts/<post-id>/original.webp`.

Never put a Supabase service-role key in the browser. The frontend only uses the publishable anon key and database policies enforce ownership.

## Database

The migration includes:

`profiles`, `follows`, `posts`, `post_media`, `post_likes`, `comments`, `comment_likes`, `saved_collections`, `saved_posts`, `stories`, `story_views`, `story_likes`, `story_replies`, `reels`, `conversations`, `conversation_members`, `messages`, `message_reactions`, `notifications`, `blocks`, `reports`, `hashtags`, `post_hashtags`, and `mentions`.

It also includes indexes, auth profile creation trigger, updated-at triggers, RLS policies, and storage policies.

## Local development

```bash
npm install
npm run dev
```

Without `.env`, the app runs in isolated demo mode so the UI can be previewed. Demo mode uses browser storage only as a development fallback; configured deployments use Supabase Auth.

## Checks and deployment

```bash
npm run lint
npm run build
npm run typecheck
npm test
npm run preview
```

The included GitHub Actions workflow deploys pushes to `main` on GitHub Pages. The build automatically uses the repository name as its base path, so project sites such as `https://username.github.io/InstagramClone/` support client-side routes. Configure the two `VITE_*` variables in the deployment environment and add the deployment URL to Supabase Auth redirect settings when enabling real mode; without them, the deployment runs in demo mode.

## Architecture

- `src/App.tsx`: chooses real mode or the isolated demo
- `src/RealApp.tsx`: schema gate, authenticated routes, and navigation
- `src/DemoApp.tsx`: legacy local preview, loaded only without configured credentials
- `src/features/`: authentication, posts, profiles, stories, search, messages, notifications, settings
- `src/services/social.ts`: typed persistence, batched hydration, uploads, signed media, account cleanup
- `src/hooks/`: session and browser history integration
- `src/components/`: accessible dialogs, media, links, toasts, error boundary
- `src/lib/supabase.ts`: environment-safe Supabase client
- `src/lib/auth.ts`: Supabase Auth/profile operations
- `src/types/social.ts`: typed tables and frontend RPC contracts
- `supabase/migrations/`: reproducible PostgreSQL/RLS/storage setup

## Known limitations

Live signup attempts for both test identities returned HTTP 429 (`email rate limit exceeded`). No confirmed test accounts were created. This environment has no connected browser or authenticated Supabase administrative connection, so new migrations could not be applied remotely and browser console/mobile/desktop QA could not be completed. Local PostgreSQL policy tests and component tests are separate from live Supabase tests. See the status report for exact coverage and remaining work.

Realtime Presence/Broadcast uses private `chat:<conversation-id>` channels and membership policies on `realtime.messages`. Configure the project's Realtime settings to disallow public channels before production use. Private media is served through short-lived signed URLs; existing URLs can remain usable until their 120-second expiry. This follows [Supabase private-bucket access](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization).
