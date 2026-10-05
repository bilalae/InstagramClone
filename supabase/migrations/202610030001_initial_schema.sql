create extension if not exists "pgcrypto";

create type public.follow_status as enum ('pending', 'accepted');
create type public.conversation_type as enum ('direct', 'group');
create type public.message_type as enum ('text', 'image', 'video', 'shared_post', 'shared_reel', 'story_reply', 'gif');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-zA-Z0-9._]{1,30}$'),
  display_name text not null default '',
  bio text not null default '',
  avatar_url text,
  website text,
  is_private boolean not null default false,
  is_verified boolean not null default false,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  status public.follow_status not null default 'accepted',
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  caption text not null default '',
  location text,
  visibility text not null default 'public' check (visibility in ('public', 'followers')),
  comments_enabled boolean not null default true,
  likes_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('image', 'video')),
  thumbnail_url text,
  width integer,
  height integer,
  duration numeric,
  order_index integer not null default 0,
  unique (post_id, order_index)
);
create table public.post_likes (user_id uuid not null references public.profiles(id) on delete cascade, post_id uuid not null references public.posts(id) on delete cascade, created_at timestamptz not null default now(), primary key (user_id, post_id));
create table public.comments (id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, parent_comment_id uuid references public.comments(id) on delete cascade, body text not null check (char_length(body) between 1 and 2200), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.comment_likes (user_id uuid not null references public.profiles(id) on delete cascade, comment_id uuid not null references public.comments(id) on delete cascade, created_at timestamptz not null default now(), primary key (user_id, comment_id));
create table public.saved_collections (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, name text not null, created_at timestamptz not null default now(), unique(user_id, name));
create table public.saved_posts (user_id uuid not null references public.profiles(id) on delete cascade, post_id uuid not null references public.posts(id) on delete cascade, collection_id uuid references public.saved_collections(id) on delete set null, created_at timestamptz not null default now(), primary key (user_id, post_id));
create table public.stories (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, media_url text not null, media_type text not null check (media_type in ('image', 'video')), created_at timestamptz not null default now(), expires_at timestamptz not null default (now() + interval '24 hours'));
create table public.story_views (story_id uuid not null references public.stories(id) on delete cascade, viewer_id uuid not null references public.profiles(id) on delete cascade, viewed_at timestamptz not null default now(), primary key (story_id, viewer_id));
create table public.story_likes (story_id uuid not null references public.stories(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), primary key (story_id, user_id));
create table public.story_replies (id uuid primary key default gen_random_uuid(), story_id uuid not null references public.stories(id) on delete cascade, sender_id uuid not null references public.profiles(id) on delete cascade, body text not null, created_at timestamptz not null default now());
create table public.reels (id uuid primary key default gen_random_uuid(), post_id uuid not null unique references public.posts(id) on delete cascade, video_url text not null, audio_title text, views bigint not null default 0, created_at timestamptz not null default now());
create table public.conversations (id uuid primary key default gen_random_uuid(), type public.conversation_type not null default 'direct', title text, created_by uuid not null references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.conversation_members (conversation_id uuid not null references public.conversations(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, joined_at timestamptz not null default now(), last_read_at timestamptz, nickname text, muted boolean not null default false, role text not null default 'member', primary key(conversation_id, user_id));
create table public.messages (id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade, sender_id uuid not null references public.profiles(id) on delete cascade, message_type public.message_type not null default 'text', body text, reply_to_message_id uuid references public.messages(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table public.message_reactions (message_id uuid not null references public.messages(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, emoji text not null, created_at timestamptz not null default now(), primary key(message_id, user_id, emoji));
create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, actor_id uuid not null references public.profiles(id) on delete cascade, type text not null, entity_id uuid, entity_type text, read boolean not null default false, created_at timestamptz not null default now());
create table public.blocks (blocker_id uuid not null references public.profiles(id) on delete cascade, blocked_id uuid not null references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), primary key(blocker_id, blocked_id), check(blocker_id <> blocked_id));
create table public.reports (id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles(id) on delete cascade, target_type text not null, target_id uuid not null, reason text not null, created_at timestamptz not null default now());
create table public.hashtags (id uuid primary key default gen_random_uuid(), name text unique not null);
create table public.post_hashtags (post_id uuid not null references public.posts(id) on delete cascade, hashtag_id uuid not null references public.hashtags(id) on delete cascade, primary key(post_id, hashtag_id));
create table public.mentions (id uuid primary key default gen_random_uuid(), actor_id uuid not null references public.profiles(id) on delete cascade, mentioned_user_id uuid not null references public.profiles(id) on delete cascade, entity_id uuid not null, entity_type text not null, created_at timestamptz not null default now());

create index posts_user_created_idx on public.posts(user_id, created_at desc);
create index post_media_post_order_idx on public.post_media(post_id, order_index);
create index follows_following_idx on public.follows(following_id, status);
create index comments_post_created_idx on public.comments(post_id, created_at desc);
create index stories_expiry_idx on public.stories(expires_at);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at desc);
create index notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index profiles_username_idx on public.profiles using gin (to_tsvector('simple', username || ' ' || display_name));

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)), coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger posts_updated_at before update on public.posts for each row execute procedure public.set_updated_at();
create trigger comments_updated_at before update on public.comments for each row execute procedure public.set_updated_at();
create trigger messages_updated_at before update on public.messages for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_likes enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;
alter table public.saved_collections enable row level security;
alter table public.saved_posts enable row level security;
alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.story_likes enable row level security;
alter table public.story_replies enable row level security;
alter table public.reels enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.notifications enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.hashtags enable row level security;
alter table public.post_hashtags enable row level security;
alter table public.mentions enable row level security;

create policy "profiles are public" on public.profiles for select using (not exists(select 1 from public.blocks b where (b.blocker_id = auth.uid() and b.blocked_id = id) or (b.blocker_id = id and b.blocked_id = auth.uid())));
create policy "users update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "users insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "public posts are readable" on public.posts for select using (visibility = 'public' or user_id = auth.uid() or exists(select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = user_id and f.status = 'accepted'));
create policy "users manage own posts" on public.posts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "media follows post access" on public.post_media for select using (exists(select 1 from public.posts p where p.id = post_id));
create policy "users manage own media" on public.post_media for all using (exists(select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())) with check (exists(select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()));
create policy "likes are readable" on public.post_likes for select using (true);
create policy "users manage own likes" on public.post_likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "comment likes are readable" on public.comment_likes for select using (true);
create policy "users manage own comment likes" on public.comment_likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "comments are readable" on public.comments for select using (exists(select 1 from public.posts p where p.id = post_id));
create policy "users manage own comments" on public.comments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "follows are readable" on public.follows for select using (true);
create policy "users manage follows" on public.follows for all using (auth.uid() = follower_id or auth.uid() = following_id) with check (auth.uid() = follower_id);
create policy "saved posts private" on public.saved_posts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "saved collections private" on public.saved_collections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "active stories readable" on public.stories for select using (expires_at > now() and (user_id = auth.uid() or exists(select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = user_id and f.status = 'accepted')));
create policy "users manage own stories" on public.stories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create or replace function public.is_conversation_member(target_conversation uuid, target_user uuid default auth.uid()) returns boolean language sql security definer set search_path = public stable as $$
  select exists(select 1 from public.conversation_members where conversation_id = target_conversation and user_id = target_user);
$$;
create policy "conversation members readable" on public.conversation_members for select using (user_id = auth.uid() or public.is_conversation_member(conversation_id));
create policy "users join conversations" on public.conversation_members for insert with check (user_id = auth.uid());
create policy "members read messages" on public.messages for select using (public.is_conversation_member(messages.conversation_id));
create policy "members send messages" on public.messages for insert with check (sender_id = auth.uid() and public.is_conversation_member(messages.conversation_id));
create policy "senders update messages" on public.messages for update using (sender_id = auth.uid());
create policy "own notifications readable" on public.notifications for select using (user_id = auth.uid());
create policy "own notifications update" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users manage own blocks" on public.blocks for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy "users create reports" on public.reports for insert with check (reporter_id = auth.uid());
create policy "hashtags are readable" on public.hashtags for select using (true);
create policy "users manage post hashtags" on public.post_hashtags for all using (exists(select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())) with check (exists(select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()));
create policy "mentions are readable" on public.mentions for select using (actor_id = auth.uid() or mentioned_user_id = auth.uid());
create policy "users create mentions" on public.mentions for insert with check (actor_id = auth.uid());

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.conversation_members;

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true), ('posts', 'posts', true), ('reels', 'reels', true), ('stories', 'stories', true), ('messages', 'messages', false) on conflict (id) do nothing;
create policy "public media is readable" on storage.objects for select using (bucket_id in ('avatars', 'posts', 'reels', 'stories'));
create policy "users upload media" on storage.objects for insert to authenticated with check (bucket_id in ('avatars', 'posts', 'reels', 'stories', 'messages') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users update own media" on storage.objects for update to authenticated using ((storage.foldername(name))[1] = auth.uid()::text);
create policy "users delete own media" on storage.objects for delete to authenticated using ((storage.foldername(name))[1] = auth.uid()::text);
