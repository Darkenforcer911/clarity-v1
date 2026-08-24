create or replace function public.get_calendar_commitments_for_date(
  p_local_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(commitment)
        || jsonb_build_object(
          'occurrence_date', p_local_date,
          'occurrence_id', occurrence.id,
          'status', case occurrence.outcome
            when 'attended' then 'completed'
            when 'missed' then 'missed'
            when 'cancelled' then 'cancelled'
            when 'rescheduled' then 'cancelled'
            else commitment.status::text
          end,
          'reconciliation_outcome', occurrence.outcome,
          'outcome_note', occurrence.outcome_note,
          'outcome_recorded_at', occurrence.recorded_at,
          'completed_at', occurrence.completed_at,
          'replacement_commitment_id', occurrence.replacement_commitment_id,
          'can_undo_completion', coalesce(
            occurrence.outcome = 'attended',
            false
          )
        )
      order by
        case commitment.commitment_type
          when 'event' then 0
          else 1
        end,
        coalesce(
          commitment.event_start_time,
          commitment.deadline_due_time,
          time '23:59:59'
        ),
        commitment.created_at,
        commitment.id
    ),
    '[]'::jsonb
  )
  into v_result
  from public.calendar_commitments as commitment
  left join public.calendar_commitment_occurrences as occurrence
    on occurrence.calendar_commitment_id = commitment.id
    and occurrence.user_id = v_user_id
    and occurrence.occurrence_date = p_local_date
  where commitment.user_id = v_user_id
    and (
      occurrence.id is not null
      or (
        commitment.status <> 'scheduled'
        and commitment.local_date = p_local_date
      )
      or (
        commitment.status = 'scheduled'
        and commitment.local_date <= p_local_date
        and (
          (
            commitment.recurrence = 'none'
            and commitment.local_date = p_local_date
          )
          or commitment.recurrence = 'daily'
          or (
            commitment.recurrence = 'weekly'
            and (p_local_date - commitment.local_date) % 7 = 0
          )
          or (
            commitment.recurrence = 'fortnightly'
            and (p_local_date - commitment.local_date) % 14 = 0
          )
          or (
            commitment.recurrence = 'monthly'
            and extract(day from p_local_date)
              = extract(day from commitment.local_date)
          )
        )
      )
    );

  return v_result;
end;
$$;

revoke all on function public.get_calendar_commitments_for_date(date)
from public, anon, authenticated;
grant execute on function public.get_calendar_commitments_for_date(date)
to authenticated;

notify pgrst, 'reload schema';
