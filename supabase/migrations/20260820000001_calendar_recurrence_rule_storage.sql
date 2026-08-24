alter type public.calendar_recurrence_preset
  add value if not exists 'yearly';

create type public.calendar_recurrence_unit as enum (
  'day',
  'week',
  'month',
  'year'
);

alter table public.calendar_commitments
  add column recurrence_unit public.calendar_recurrence_unit,
  add column recurrence_interval smallint not null default 1,
  add column recurrence_weekdays smallint[] not null default '{}';

update public.calendar_commitments
set
  recurrence_unit = case recurrence
    when 'daily' then 'day'::public.calendar_recurrence_unit
    when 'weekly' then 'week'::public.calendar_recurrence_unit
    when 'fortnightly' then 'week'::public.calendar_recurrence_unit
    when 'monthly' then 'month'::public.calendar_recurrence_unit
    else null
  end,
  recurrence_interval = case recurrence
    when 'fortnightly' then 2
    else 1
  end,
  recurrence_weekdays = case
    when recurrence in ('weekly', 'fortnightly')
      then array[extract(isodow from local_date)::smallint]
    else '{}'::smallint[]
  end;

notify pgrst, 'reload schema';
