alter type public.clarity_change_proposal_type
  add value if not exists 'action_create';

notify pgrst, 'reload schema';
