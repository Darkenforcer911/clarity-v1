create function public.delete_action_note(
  p_action_note_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_daily_action_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select action_note.daily_action_id
  into v_daily_action_id
  from public.action_notes as action_note
  inner join public.daily_actions as daily_action
    on daily_action.id = action_note.daily_action_id
    and daily_action.user_id = action_note.user_id
  where action_note.id = p_action_note_id
    and action_note.user_id = v_user_id
    and daily_action.user_id = v_user_id
  for update of action_note;

  if v_daily_action_id is null then
    raise exception 'Action update not found or not owned by user';
  end if;

  delete from public.action_notes
  where id = p_action_note_id
    and user_id = v_user_id;

  update public.profiles
  set last_active_at = now()
  where id = v_user_id;

  return v_daily_action_id;
end;
$$;

revoke all on function public.delete_action_note(uuid)
  from public, anon;

grant execute on function public.delete_action_note(uuid)
  to authenticated;
