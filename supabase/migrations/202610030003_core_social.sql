-- Core social behavior: safe profile bootstrap, follows/notifications, and
-- an atomic direct-message conversation helper.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  requested_username text;
begin
  requested_username := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', ''), '[^a-zA-Z0-9._]', '', 'g'));
  if requested_username = '' then requested_username := 'user_' || substr(new.id::text, 1, 8); end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, left(requested_username, 30), coalesce(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do update set
    username = excluded.username,
    display_name = excluded.display_name,
    updated_at = now();
  return new;
exception when unique_violation then
  insert into public.profiles (id, username, display_name)
  values (new.id, 'user_' || substr(new.id::text, 1, 8), coalesce(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  return new;
end; $$;

create or replace function public.get_or_create_direct_conversation(target_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  current_user_id uuid := auth.uid();
  conversation_id uuid;
begin
  if current_user_id is null or target_user_id is null or current_user_id = target_user_id then
    raise exception 'A direct conversation requires two different authenticated users';
  end if;
  select c.id into conversation_id
  from public.conversations c
  join public.conversation_members a on a.conversation_id = c.id and a.user_id = current_user_id
  join public.conversation_members b on b.conversation_id = c.id and b.user_id = target_user_id
  where c.type = 'direct'
  limit 1;
  if conversation_id is null then
    insert into public.conversations (type, created_by) values ('direct', current_user_id) returning id into conversation_id;
    insert into public.conversation_members (conversation_id, user_id) values (conversation_id, current_user_id), (conversation_id, target_user_id);
  end if;
  return conversation_id;
end; $$;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

drop policy if exists "users create conversations" on public.conversations;
create policy "users create conversations" on public.conversations for insert with check (created_by = auth.uid());
drop policy if exists "members read conversations" on public.conversations;
create policy "members read conversations" on public.conversations for select using (public.is_conversation_member(id));
drop policy if exists "members update conversations" on public.conversations;
create policy "members update conversations" on public.conversations for update using (public.is_conversation_member(id));

drop policy if exists "users join conversations" on public.conversation_members;
create policy "users join conversations" on public.conversation_members for insert
with check (user_id = auth.uid() or exists (select 1 from public.conversations c where c.id = conversation_id and c.created_by = auth.uid()));

create or replace function public.create_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  notification_type text;
  entity uuid;
  actor uuid;
begin
  if tg_table_name = 'follows' then target := new.following_id; actor := new.follower_id; notification_type := 'follow'; entity := new.follower_id;
  elsif tg_table_name = 'post_likes' then select user_id into target from public.posts where id = new.post_id; actor := new.user_id; notification_type := 'like'; entity := new.post_id;
  elsif tg_table_name = 'comments' then select user_id into target from public.posts where id = new.post_id; actor := new.user_id; notification_type := 'comment'; entity := new.post_id;
  end if;
  if target is not null and target <> actor then
    insert into public.notifications (user_id, actor_id, type, entity_id, entity_type)
    values (target, actor, notification_type, entity, tg_table_name);
  end if;
  return new;
end; $$;

drop trigger if exists follows_notification on public.follows;
create trigger follows_notification after insert on public.follows for each row execute function public.create_notification();
drop trigger if exists post_likes_notification on public.post_likes;
create trigger post_likes_notification after insert on public.post_likes for each row execute function public.create_notification();
drop trigger if exists comments_notification on public.comments;
create trigger comments_notification after insert on public.comments for each row execute function public.create_notification();
