create or replace function public.is_conversation_member(target_conversation uuid, target_user uuid default auth.uid()) returns boolean language sql security definer set search_path = public stable as $$
  select exists(select 1 from public.conversation_members where conversation_id = target_conversation and user_id = target_user);
$$;

drop policy if exists "conversation members readable" on public.conversation_members;
create policy "conversation members readable" on public.conversation_members for select using (user_id = auth.uid() or public.is_conversation_member(conversation_id));

drop policy if exists "members read messages" on public.messages;
create policy "members read messages" on public.messages for select using (public.is_conversation_member(messages.conversation_id));

drop policy if exists "members send messages" on public.messages;
create policy "members send messages" on public.messages for insert with check (sender_id = auth.uid() and public.is_conversation_member(messages.conversation_id));
