create or replace function public.delete_calendar_commitment(
  p_calendar_commitment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_commitment public.calendar_commitments%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select commitment.*
  into v_commitment
  from public.calendar_commitments as commitment
  where commitment.id = p_calendar_commitment_id
    and commitment.user_id = v_user_id
  for update;

  if v_commitment.id is null then
    raise exception 'Calendar commitment not found';
  end if;

  if v_commitment.recurrence <> 'none' then
    raise exception 'Recurring commitments must be cancelled or corrected by occurrence';
  end if;

  -- A Calendar deletion must never silently delete or detach a canonical Action.
  if exists (
    select 1
    from public.daily_actions as action
    where action.user_id = v_user_id
      and action.source_calendar_commitment_id = v_commitment.id
  ) then
    raise exception 'Calendar commitment is linked to an Action';
  end if;

  -- Lock the owned occurrence set before inspecting or removing its dependants.
  perform 1
  from public.calendar_commitment_occurrences as occurrence
  where occurrence.calendar_commitment_id = v_commitment.id
    and occurrence.user_id = v_user_id
  for update;

  -- Confirmed Life evidence has independent canonical meaning. Do not erase or
  -- detach it as an implicit side effect of deleting its source occurrence.
  if exists (
    select 1
    from public.life_evidence as evidence
    join public.calendar_commitment_occurrences as occurrence
      on occurrence.id = evidence.source_calendar_occurrence_id
     and occurrence.user_id = evidence.user_id
    where occurrence.calendar_commitment_id = v_commitment.id
      and occurrence.user_id = v_user_id
  ) then
    raise exception 'Calendar occurrence is referenced by Life evidence';
  end if;

  perform 1
  from public.calendar_commitment_occurrence_revisions as revision
  join public.calendar_commitment_occurrences as occurrence
    on occurrence.id = revision.calendar_commitment_occurrence_id
   and occurrence.user_id = revision.user_id
  where occurrence.calendar_commitment_id = v_commitment.id
    and occurrence.user_id = v_user_id
  for update of revision;

  delete from public.calendar_commitment_occurrence_revisions as revision
  using public.calendar_commitment_occurrences as occurrence
  where revision.calendar_commitment_occurrence_id = occurrence.id
    and revision.user_id = occurrence.user_id
    and occurrence.calendar_commitment_id = v_commitment.id
    and occurrence.user_id = v_user_id;

  delete from public.calendar_commitment_occurrences as occurrence
  where occurrence.calendar_commitment_id = v_commitment.id
    and occurrence.user_id = v_user_id;

  delete from public.calendar_commitments as commitment
  where commitment.id = v_commitment.id
    and commitment.user_id = v_user_id;

  if not found then
    raise exception 'Calendar commitment not found';
  end if;
end;
$$;

revoke all on function public.delete_calendar_commitment(uuid)
from public, anon, authenticated;
grant execute on function public.delete_calendar_commitment(uuid)
to authenticated;

notify pgrst, 'reload schema';
