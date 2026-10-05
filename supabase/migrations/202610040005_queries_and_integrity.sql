begin;
create function public.app_schema_version() returns integer language sql immutable as $$select 5$$;
create function public.publish_post(caption_text text,location_text text,media_items jsonb,allow_comments boolean default true,hide_likes boolean default false,as_reel boolean default false,audio_text text default null) returns uuid language plpgsql security invoker set search_path='' as $$declare pid uuid; item jsonb; ordinal bigint; begin
 if auth.uid() is null or jsonb_typeof(media_items)<>'array' or jsonb_array_length(media_items) not between 1 and 10 or length(caption_text)>2200 then raise exception 'Invalid post'; end if;
 if as_reel and (jsonb_array_length(media_items)<>1 or media_items->0->>'media_type'<>'video') then raise exception 'A reel requires one video'; end if;
 insert into public.posts(user_id,caption,location,comments_enabled,likes_hidden) values(auth.uid(),caption_text,location_text,allow_comments,hide_likes) returning id into pid;
 for item,ordinal in select value,ordinality from jsonb_array_elements(media_items) with ordinality loop
 if length(coalesce(item->>'alt_text',''))>500 then raise exception 'Alt text too long'; end if;
 insert into public.post_media(post_id,media_url,media_type,thumbnail_url,alt_text,order_index) values(pid,item->>'media_url',item->>'media_type',item->>'thumbnail_url',coalesce(item->>'alt_text',''),ordinal-1);
 end loop;
 if as_reel then insert into public.reels(post_id,video_url,audio_title) values(pid,media_items->0->>'media_url',audio_text); end if;
 return pid; end;$$;
revoke all on function public.publish_post(text,text,jsonb,boolean,boolean,boolean,text) from public,anon;
grant execute on function public.publish_post(text,text,jsonb,boolean,boolean,boolean,text) to authenticated;
grant execute on function public.app_schema_version() to anon,authenticated;
create function public.username_available(candidate text) returns boolean language sql stable security definer set search_path='' as $$
 select candidate ~ '^[a-zA-Z0-9._]{1,30}$' and lower(candidate) not in ('login','signup','onboarding','explore','reels','reel','direct','notifications','create','settings','saved','p','tags','search','stories','forgot-password','reset-password') and not exists(select 1 from public.profiles where lower(username)=lower(candidate) and id<>coalesce(auth.uid(),'00000000-0000-0000-0000-000000000000'::uuid)); $$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to authenticated,anon;
create function public.normalize_username() returns trigger language plpgsql set search_path='' as $$begin
 new.username:=lower(new.username);
 if new.username in ('login','signup','onboarding','explore','reels','reel','direct','notifications','create','settings','saved','p','tags','search','stories') then raise exception 'This username is reserved'; end if;
 return new; end;$$;
create trigger normalize_username before insert or update of username on public.profiles for each row execute function public.normalize_username();
create unique index profiles_username_lower_unique on public.profiles(lower(username));
create function public.inbox_unread(conversation_ids uuid[]) returns table(conversation_id uuid, unread bigint) language sql stable security invoker set search_path='' as $$
 select cm.conversation_id,count(m.id) from public.conversation_members cm left join public.messages m on m.conversation_id=cm.conversation_id and m.sender_id<>auth.uid() and m.created_at>coalesce(cm.last_read_at,'epoch'::timestamptz) where cm.user_id=auth.uid() and cm.conversation_id=any(conversation_ids) and cardinality(conversation_ids)<=100 group by cm.conversation_id;$$;
create function public.profile_posts(target uuid, kind text, page_offset integer default 0) returns setof public.posts language sql stable security invoker set search_path='' as $$
 select p.* from public.posts p where
 (kind='reels' and p.user_id=target and exists(select 1 from public.reels r where r.post_id=p.id)) or
 (kind='tagged' and exists(select 1 from public.mentions m where m.entity_id=p.id and m.entity_type='posts' and m.mentioned_user_id=target))
 order by p.created_at desc,p.id limit 10 offset greatest(0,least(page_offset,10000));$$;
drop policy mentions_read on public.mentions;
create policy mentions_read on public.mentions for select to authenticated using(not private.blocked(actor_id,mentioned_user_id) and (actor_id=auth.uid() or mentioned_user_id=auth.uid() or (entity_type='posts' and private.can_see_post(entity_id))));
revoke all on function public.inbox_unread(uuid[]), public.profile_posts(uuid,text,integer) from public,anon;
grant execute on function public.inbox_unread(uuid[]), public.profile_posts(uuid,text,integer) to authenticated;
create function public.post_stats(post_ids uuid[]) returns table(post_id uuid,likes bigint,comments bigint,liked boolean) language sql stable security invoker set search_path='' as $$
 select p.id,(select count(*) from public.post_likes l where l.post_id=p.id),(select count(*) from public.comments c where c.post_id=p.id),exists(select 1 from public.post_likes l where l.post_id=p.id and l.user_id=auth.uid()) from public.posts p where p.id=any(post_ids) and cardinality(post_ids)<=50;
$$;
create function public.ranked_posts(page_offset integer default 0, explore boolean default false) returns setof public.posts language sql stable security invoker set search_path='' as $$
 select p.* from public.posts p order by
 (case when not explore and (p.user_id=auth.uid() or exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.following_id=p.user_id and f.status='accepted')) then 2 else 0 end
 + 1.0/(1+extract(epoch from (now()-p.created_at))/86400)
 + least(1.0,(select count(*) from public.post_likes l where l.post_id=p.id)*0.02)
 + (abs(hashtext(p.id::text)::bigint)%100)*0.0001) desc,p.created_at desc,p.id
 limit 10 offset greatest(0,least(page_offset,10000));
$$;
create function public.media_integrity() returns trigger language plpgsql set search_path='' as $$declare owner_id uuid; begin
 if tg_table_name='post_media' then
 select user_id into owner_id from public.posts where id=new.post_id;
 if new.media_url not like owner_id::text||'/%' then raise exception 'Media must use the owner storage folder'; end if;
 if new.thumbnail_url is not null and new.thumbnail_url not like owner_id::text||'/%' then raise exception 'Invalid thumbnail owner'; end if;
 elsif tg_table_name='stories' then
 if new.media_url not like new.user_id::text||'/%' then raise exception 'Invalid story media owner'; end if;
 elsif tg_table_name='reels' then
 if not exists(select 1 from public.post_media m where m.post_id=new.post_id and m.media_type='video' and m.media_url=new.video_url) then raise exception 'Reel must reference its post video'; end if;
 end if; return new; end;$$;
create trigger post_media_integrity before insert on public.post_media for each row execute function public.media_integrity();
create trigger story_media_integrity before insert on public.stories for each row execute function public.media_integrity();
create trigger reel_media_integrity before insert on public.reels for each row execute function public.media_integrity();
create function public.story_reply_notification() returns trigger language plpgsql security definer set search_path='' as $$declare target uuid; begin
 if new.message_type='story_reply' and new.story_id is not null then
 select user_id into target from public.stories where id=new.story_id;
 if target<>new.sender_id and not private.blocked(target,new.sender_id) then
 insert into public.notifications(user_id,actor_id,type,entity_id,entity_type) values(target,new.sender_id,'story_reply',new.conversation_id,'conversation'); end if;
 end if; return new; end;$$;
create trigger story_reply_notification after insert on public.messages for each row execute function public.story_reply_notification();
create function private.notification_preference() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.user_id=new.actor_id or private.blocked(new.user_id,new.actor_id) or not coalesce((select notifications_enabled from public.user_settings where user_id=new.user_id),true) then return null; end if;
 return new; end;$$;
revoke all on function private.notification_preference() from public,anon,authenticated;
create trigger notification_preference before insert on public.notifications for each row execute function private.notification_preference();
revoke all on function public.story_reply_notification() from public,anon,authenticated;
revoke all on function public.post_stats(uuid[]),public.ranked_posts(integer,boolean) from public,anon;
grant execute on function public.post_stats(uuid[]),public.ranked_posts(integer,boolean) to authenticated;
-- Prevent changing private endpoints/owners via otherwise harmless update operations.
revoke update on public.saved_posts from authenticated;grant update(collection_id) on public.saved_posts to authenticated;
revoke update on public.saved_collections from authenticated;grant update(name) on public.saved_collections to authenticated;
create index post_likes_post_idx on public.post_likes(post_id);
create index comment_likes_comment_idx on public.comment_likes(comment_id);
create index story_views_owner_idx on public.story_views(viewer_id,story_id);
create index saved_posts_collection_idx on public.saved_posts(user_id,collection_id,created_at desc);
create index story_likes_story_idx on public.story_likes(story_id);
alter publication supabase_realtime add table public.message_reactions;
commit;
