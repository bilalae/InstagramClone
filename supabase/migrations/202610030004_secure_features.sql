-- Forward-only repair of access control and the missing social operations.
begin;
create schema if not exists private;
grant usage on schema private to authenticated;
alter table public.post_media add column alt_text text not null default '';
alter table public.messages add column media_path text;
alter table public.messages add column shared_post_id uuid references public.posts(id) on delete set null;
alter table public.messages add column story_id uuid references public.stories(id) on delete set null;
create table public.user_settings (user_id uuid primary key references public.profiles(id) on delete cascade, appearance text not null default 'system' check(appearance in ('light','dark','system')), notifications_enabled boolean not null default true);
create table public.recent_searches (user_id uuid references public.profiles(id) on delete cascade, query text not null check(length(query) between 1 and 100), created_at timestamptz default now() not null, primary key(user_id,query));
create table public.reel_views (reel_id uuid references public.reels(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, primary key(reel_id,user_id));
create index posts_created_idx on public.posts(created_at desc,id);
create index notifications_unread_idx on public.notifications(user_id,read,created_at desc);
create index members_user_idx on public.conversation_members(user_id,conversation_id);
create index blocks_reverse_idx on public.blocks(blocked_id,blocker_id);
create index post_hashtags_tag_idx on public.post_hashtags(hashtag_id,post_id);
create index profiles_search_idx on public.profiles(lower(username) text_pattern_ops);

create or replace function private.blocked(a uuid,b uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.blocks where (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a)); $$;
create or replace function private.can_see_user(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and not private.blocked(auth.uid(),target) and exists(select 1 from public.profiles p where p.id=target and (p.id=auth.uid() or not p.is_private or exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.following_id=p.id and f.status='accepted'))); $$;
create or replace function private.can_see_post(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.posts p where p.id=target and private.can_see_user(p.user_id) and (p.user_id=auth.uid() or p.visibility='public' or exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.following_id=p.user_id and f.status='accepted'))); $$;
create or replace function public.is_conversation_member(target_conversation uuid,target_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path = '' as $$
 select target_user=auth.uid() and exists(select 1 from public.conversation_members where conversation_id=target_conversation and user_id=auth.uid()); $$;
create function private.can_chat(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select public.is_conversation_member(target) and not exists(select 1 from public.conversation_members m where m.conversation_id=target and private.blocked(auth.uid(),m.user_id)); $$;
create function private.owns_post(target uuid) returns boolean language sql stable security definer set search_path = '' as $$select exists(select 1 from public.posts where id=target and user_id=auth.uid());$$;
create function private.can_see_story(target uuid) returns boolean language sql stable security definer set search_path = '' as $$select exists(select 1 from public.stories where id=target and expires_at>now() and private.can_see_user(user_id));$$;

-- Replace permissive legacy policies, including FOR ALL policies that bypass SELECT privacy.
do $$ declare r record; begin
 for r in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in ('profiles','follows','posts','post_media','post_likes','comments','comment_likes','saved_collections','saved_posts','stories','story_views','story_likes','story_replies','reels','conversations','conversation_members','messages','message_reactions','notifications','blocks','reports','hashtags','post_hashtags','mentions','user_settings','recent_searches','reel_views') loop
 execute format('drop policy %I on %I.%I',r.policyname,r.schemaname,r.tablename); end loop;
 for r in select tablename from pg_tables where schemaname='public' and tablename in ('profiles','follows','posts','post_media','post_likes','comments','comment_likes','saved_collections','saved_posts','stories','story_views','story_likes','story_replies','reels','conversations','conversation_members','messages','message_reactions','notifications','blocks','reports','hashtags','post_hashtags','mentions','user_settings','recent_searches','reel_views') loop execute format('alter table public.%I enable row level security',r.tablename); end loop;
end $$;
create policy profile_read on public.profiles for select to authenticated using(not private.blocked(auth.uid(),id));
create policy profile_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
-- Verification is privileged, even when updating one's own row.
revoke update on public.profiles from authenticated,anon;
grant update(username,display_name,bio,avatar_url,website,is_private,onboarding_completed) on public.profiles to authenticated;
create policy post_read on public.posts for select to authenticated using(user_id=auth.uid() or private.can_see_post(id));
create policy post_insert on public.posts for insert to authenticated with check(user_id=auth.uid());
create policy post_update on public.posts for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy post_delete on public.posts for delete to authenticated using(user_id=auth.uid());
create policy media_read on public.post_media for select to authenticated using(private.can_see_post(post_id));
create policy media_insert on public.post_media for insert to authenticated with check(private.owns_post(post_id));
create policy media_delete on public.post_media for delete to authenticated using(private.owns_post(post_id));
create policy likes_read on public.post_likes for select to authenticated using(private.can_see_post(post_id));
create policy likes_insert on public.post_likes for insert to authenticated with check(user_id=auth.uid() and private.can_see_post(post_id));
create policy likes_delete on public.post_likes for delete to authenticated using(user_id=auth.uid());
create policy comments_read on public.comments for select to authenticated using(private.can_see_post(post_id) and not private.blocked(auth.uid(),user_id));
create policy comments_insert on public.comments for insert to authenticated with check(user_id=auth.uid() and private.can_see_post(post_id) and exists(select 1 from public.posts where id=post_id and comments_enabled));
create policy comments_delete on public.comments for delete to authenticated using(user_id=auth.uid());
create policy comment_likes_read on public.comment_likes for select to authenticated using(exists(select 1 from public.comments c where c.id=comment_id));
create policy comment_likes_insert on public.comment_likes for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.comments c where c.id=comment_id));
create policy comment_likes_delete on public.comment_likes for delete to authenticated using(user_id=auth.uid());
create policy follows_read on public.follows for select to authenticated using(not private.blocked(auth.uid(),follower_id) and not private.blocked(auth.uid(),following_id) and (status='accepted' or auth.uid() in(follower_id,following_id)));
create policy follows_insert on public.follows for insert to authenticated with check(follower_id=auth.uid() and not private.blocked(follower_id,following_id) and status=case when (select is_private from public.profiles where id=following_id) then 'pending'::public.follow_status else 'accepted'::public.follow_status end);
create policy follows_update on public.follows for update to authenticated using(following_id=auth.uid()) with check(following_id=auth.uid() and not private.blocked(follower_id,following_id));
revoke update on public.follows from authenticated; grant update(status) on public.follows to authenticated;
create policy follows_delete on public.follows for delete to authenticated using(auth.uid() in(follower_id,following_id));
create policy collections_own on public.saved_collections for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy saves_read on public.saved_posts for select to authenticated using(user_id=auth.uid());
create policy saves_insert on public.saved_posts for insert to authenticated with check(user_id=auth.uid() and private.can_see_post(post_id) and (collection_id is null or exists(select 1 from public.saved_collections c where c.id=collection_id and c.user_id=auth.uid())));
create policy saves_update on public.saved_posts for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and (collection_id is null or exists(select 1 from public.saved_collections c where c.id=collection_id and c.user_id=auth.uid())));
create policy saves_delete on public.saved_posts for delete to authenticated using(user_id=auth.uid());
create policy stories_read on public.stories for select to authenticated using(expires_at>now() and (user_id=auth.uid() or private.can_see_story(id)));
create policy stories_insert on public.stories for insert to authenticated with check(user_id=auth.uid() and expires_at<=now()+interval '24 hours' and expires_at>now());
create policy stories_delete on public.stories for delete to authenticated using(user_id=auth.uid());
create policy story_views_read on public.story_views for select to authenticated using(viewer_id=auth.uid() or exists(select 1 from public.stories s where s.id=story_id and s.user_id=auth.uid()));
create policy story_views_insert on public.story_views for insert to authenticated with check(viewer_id=auth.uid() and private.can_see_story(story_id));
create policy story_likes_read on public.story_likes for select to authenticated using(private.can_see_story(story_id));
create policy story_likes_insert on public.story_likes for insert to authenticated with check(user_id=auth.uid() and private.can_see_story(story_id));
create policy story_likes_delete on public.story_likes for delete to authenticated using(user_id=auth.uid());
create policy story_replies_read on public.story_replies for select to authenticated using(sender_id=auth.uid() or exists(select 1 from public.stories s where s.id=story_id and s.user_id=auth.uid()));
create policy reels_read on public.reels for select to authenticated using(private.can_see_post(post_id));
create policy reels_insert on public.reels for insert to authenticated with check(private.owns_post(post_id) and views=0);
create policy reel_views_insert on public.reel_views for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.reels r where r.id=reel_id));
create policy reel_views_read on public.reel_views for select to authenticated using(user_id=auth.uid());
create policy conversations_read on public.conversations for select to authenticated using(private.can_chat(id));
create policy members_read on public.conversation_members for select to authenticated using(private.can_chat(conversation_id));
create policy members_update on public.conversation_members for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
revoke update on public.conversation_members from authenticated; grant update(last_read_at,muted,nickname) on public.conversation_members to authenticated;
create policy messages_read on public.messages for select to authenticated using(private.can_chat(conversation_id));
create policy messages_insert on public.messages for insert to authenticated with check(sender_id=auth.uid() and private.can_chat(conversation_id) and (shared_post_id is null or private.can_see_post(shared_post_id)) and (story_id is null or private.can_see_story(story_id)));
create policy messages_delete on public.messages for delete to authenticated using(sender_id=auth.uid());
create policy reactions_read on public.message_reactions for select to authenticated using(exists(select 1 from public.messages m where m.id=message_id));
create policy reactions_insert on public.message_reactions for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.messages m where m.id=message_id));
create policy reactions_delete on public.message_reactions for delete to authenticated using(user_id=auth.uid());
create policy notifications_read on public.notifications for select to authenticated using(user_id=auth.uid() and not private.blocked(auth.uid(),actor_id));
create policy notifications_update on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
revoke update on public.notifications from authenticated; grant update(read) on public.notifications to authenticated;
create policy blocks_own on public.blocks for all to authenticated using(blocker_id=auth.uid()) with check(blocker_id=auth.uid());
create policy reports_insert on public.reports for insert to authenticated with check(reporter_id=auth.uid() and length(reason) between 1 and 2200);
create policy hashtags_read on public.hashtags for select to authenticated using(exists(select 1 from public.post_hashtags ph where ph.hashtag_id=id and private.can_see_post(ph.post_id)));
create policy post_hashtags_read on public.post_hashtags for select to authenticated using(private.can_see_post(post_id));
create policy mentions_read on public.mentions for select to authenticated using((actor_id=auth.uid() or mentioned_user_id=auth.uid()) and not private.blocked(actor_id,mentioned_user_id));
create policy settings_own on public.user_settings for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy searches_own on public.recent_searches for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create function public.validate_relations() returns trigger language plpgsql set search_path='' as $$begin
 if tg_table_name='comments' then if new.parent_comment_id is null then return new; end if;
 if not exists(select 1 from public.comments c where c.id=new.parent_comment_id and c.post_id=new.post_id) then raise exception 'Reply must belong to the same post'; end if;
 elsif tg_table_name='messages' then
 if new.reply_to_message_id is not null and not exists(select 1 from public.messages m where m.id=new.reply_to_message_id and m.conversation_id=new.conversation_id) then raise exception 'Reply must belong to the same conversation'; end if;
 if length(coalesce(new.body,''))>5000 then raise exception 'Message too long'; end if;
 if new.media_path is not null and split_part(new.media_path,'/',1)<>auth.uid()::text then raise exception 'Invalid media owner'; end if;
 end if; return new; end;$$;
create trigger comment_relations before insert on public.comments for each row execute function public.validate_relations();
create trigger message_relations before insert on public.messages for each row execute function public.validate_relations();
create function public.after_block() returns trigger language plpgsql security definer set search_path='' as $$begin
 delete from public.follows where (follower_id=new.blocker_id and following_id=new.blocked_id) or (following_id=new.blocker_id and follower_id=new.blocked_id); return new; end;$$;
create trigger block_cleanup after insert on public.blocks for each row execute function public.after_block();

create or replace function public.get_or_create_direct_conversation(target_user_id uuid) returns uuid language plpgsql security definer set search_path='' as $$declare cid uuid; me uuid:=auth.uid(); begin
 if me is null or me=target_user_id or private.blocked(me,target_user_id) then raise exception 'Conversation not allowed'; end if;
 perform pg_advisory_xact_lock(hashtextextended(least(me::text,target_user_id::text)||greatest(me::text,target_user_id::text),0));
 select c.id into cid from public.conversations c where c.type='direct' and exists(select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=me) and exists(select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=target_user_id) limit 1;
 if cid is null then insert into public.conversations(type,created_by) values('direct',me) returning id into cid; insert into public.conversation_members(conversation_id,user_id) values(cid,me),(cid,target_user_id); end if; return cid; end;$$;
create function public.create_group(group_title text, member_ids uuid[]) returns uuid language plpgsql security definer set search_path='' as $$declare cid uuid; member uuid; begin
 if auth.uid() is null or length(trim(group_title)) not between 1 and 100 or cardinality(member_ids) not between 1 and 49 then raise exception 'Invalid group'; end if;
 insert into public.conversations(type,title,created_by) values('group',trim(group_title),auth.uid()) returning id into cid;
 insert into public.conversation_members(conversation_id,user_id,role) values(cid,auth.uid(),'admin');
 foreach member in array member_ids loop
 if private.blocked(auth.uid(),member) then raise exception 'Blocked member'; end if;
 insert into public.conversation_members(conversation_id,user_id) values(cid,member) on conflict do nothing; end loop; return cid; end;$$;
create function public.manage_group(cid uuid, member uuid, remove_member boolean default false, new_title text default null) returns void language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.conversations c where c.id=cid and c.type='group' and c.created_by=auth.uid()) then raise exception 'Only group owner can manage members'; end if;
 if new_title is not null then if length(trim(new_title)) not between 1 and 100 then raise exception 'Invalid title'; end if; update public.conversations set title=trim(new_title) where id=cid; return; end if;
 if member=auth.uid() then raise exception 'Cannot remove group owner'; end if;
 if remove_member then delete from public.conversation_members where conversation_id=cid and user_id=member;
 else if exists(select 1 from public.conversation_members m where m.conversation_id=cid and private.blocked(m.user_id,member)) then raise exception 'Blocked member'; end if; insert into public.conversation_members(conversation_id,user_id) values(cid,member) on conflict do nothing; end if; end;$$;
create function public.delete_my_account() returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 delete from auth.users where id=auth.uid(); end;$$;

create or replace function public.create_notification() returns trigger language plpgsql security definer set search_path='' as $$declare target uuid; actor uuid; entity uuid; kind text; et text; parent_author uuid; begin
 if tg_table_name='follows' then
 if tg_op='UPDATE' then if old.status=new.status then return new; end if; target:=new.follower_id; actor:=new.following_id; kind:='follow_accepted';
 else target:=new.following_id; actor:=new.follower_id; kind:=case when new.status='pending' then 'follow_request' else 'follow' end; end if; entity:=actor; et:='profile';
 elsif tg_table_name='post_likes' then select user_id into target from public.posts where id=new.post_id; actor:=new.user_id; entity:=new.post_id; kind:='like'; et:='post';
 elsif tg_table_name='comments' then select user_id into target from public.posts where id=new.post_id; actor:=new.user_id; entity:=new.post_id; kind:='comment'; et:='post';
 if new.parent_comment_id is not null then select user_id into parent_author from public.comments where id=new.parent_comment_id; if parent_author<>actor and parent_author<>target and not private.blocked(actor,parent_author) then insert into public.notifications(user_id,actor_id,type,entity_id,entity_type) values(parent_author,actor,'reply',entity,et); end if; end if;
 elsif tg_table_name='comment_likes' then select user_id,post_id into target,entity from public.comments where id=new.comment_id; actor:=new.user_id; kind:='comment_like'; et:='post';
 elsif tg_table_name='story_likes' then select user_id into target from public.stories where id=new.story_id; actor:=new.user_id; entity:=new.story_id; kind:='story_like'; et:='story';
 end if;
 if target is not null and target<>actor and not private.blocked(actor,target) and coalesce((select notifications_enabled from public.user_settings where user_id=target),true) then insert into public.notifications(user_id,actor_id,type,entity_id,entity_type) values(target,actor,kind,entity,et); end if; return new; end;$$;
create trigger follows_accepted_notification after update on public.follows for each row execute function public.create_notification();
create trigger comment_like_notification after insert on public.comment_likes for each row execute function public.create_notification();
create trigger story_like_notification after insert on public.story_likes for each row execute function public.create_notification();
create function public.index_content() returns trigger language plpgsql security definer set search_path='' as $$declare content text; tag text; hid uuid; person record; entity uuid; begin
 if tg_table_name='posts' then content:=new.caption; entity:=new.id; else content:=new.body; entity:=new.post_id; end if;
 if tg_table_name='posts' then
 delete from public.post_hashtags where post_id=new.id;
 for tag in select distinct lower(m[1]) from regexp_matches(content,'#([[:alnum:]_]+)','g') m loop
 insert into public.hashtags(name) values(tag) on conflict(name) do update set name=excluded.name returning id into hid;
 insert into public.post_hashtags values(new.id,hid) on conflict do nothing; end loop; end if;
 for person in select distinct p.id from regexp_matches(content,'@([a-zA-Z0-9._]+)','g') m join public.profiles p on lower(p.username)=lower(m[1]) loop
 if person.id<>new.user_id and not private.blocked(person.id,new.user_id) and not exists(select 1 from public.mentions where actor_id=new.user_id and mentioned_user_id=person.id and entity_id=new.id) then
 insert into public.mentions(actor_id,mentioned_user_id,entity_id,entity_type) values(new.user_id,person.id,new.id,tg_table_name);
 insert into public.notifications(user_id,actor_id,type,entity_id,entity_type) values(person.id,new.user_id,'mention',entity,'post'); end if; end loop; return new; end;$$;
create trigger post_content after insert or update of caption on public.posts for each row execute function public.index_content();
create trigger comment_content after insert on public.comments for each row execute function public.index_content();
create function public.count_reel_view() returns trigger language plpgsql security definer set search_path='' as $$begin update public.reels set views=views+1 where id=new.reel_id; return new; end;$$;
create trigger reel_view after insert on public.reel_views for each row execute function public.count_reel_view();
create function public.message_activity() returns trigger language plpgsql security definer set search_path='' as $$begin update public.conversations set updated_at=now() where id=coalesce(new.conversation_id,old.conversation_id); return coalesce(new,old); end;$$;
create trigger message_activity after insert or delete on public.messages for each row execute function public.message_activity();

-- Private buckets prevent public URL bypass. Keep stored object paths, sign on access.
update storage.buckets set public=false, file_size_limit=104857600, allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'] where id in('posts','reels','stories','messages');
update storage.buckets set file_size_limit=26214400,allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif'] where id='avatars';
drop policy if exists "public media is readable" on storage.objects;
drop policy if exists "users update own media" on storage.objects;
create policy media_access on storage.objects for select to authenticated using(
 bucket_id='avatars' or ((storage.foldername(name))[1]=auth.uid()::text) or
 (bucket_id in('posts','reels') and exists(select 1 from public.post_media m where (m.media_url=name or m.thumbnail_url=name or m.media_url like '%/'||bucket_id||'/'||name) and private.can_see_post(m.post_id))) or
 (bucket_id='stories' and exists(select 1 from public.stories s where (s.media_url=name or s.media_url like '%/stories/'||name) and private.can_see_story(s.id))) or
 (bucket_id='messages' and exists(select 1 from public.messages m where m.media_path=name and private.can_chat(m.conversation_id)))
);
-- Helper RPCs execute only with an authenticated identity; trigger functions are not RPCs.
do $$ declare r record; begin for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and ((n.nspname='private' and p.proname in ('blocked','can_see_user','can_see_post','can_chat','owns_post','can_see_story')) or (n.nspname='public' and p.proname in ('handle_new_user','is_conversation_member','get_or_create_direct_conversation','create_notification','after_block','create_group','manage_group','delete_my_account','index_content','count_reel_view','message_activity'))) loop
 execute format('revoke all on function %s from public, anon',r.signature);
 execute format('grant execute on function %s to authenticated',r.signature); end loop; end $$;
grant select,insert,update,delete on public.user_settings,public.recent_searches,public.reel_views to authenticated;
create policy chat_presence_read on realtime.messages for select to authenticated using(exists(select 1 from public.conversations c where 'chat:'||c.id::text=realtime.topic() and private.can_chat(c.id)));
create policy chat_presence_write on realtime.messages for insert to authenticated with check(exists(select 1 from public.conversations c where 'chat:'||c.id::text=realtime.topic() and private.can_chat(c.id)));
alter publication supabase_realtime add table public.conversations;
commit;

