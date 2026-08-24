create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $scheduler$
declare
  v_job_id bigint;
  v_command text := $command$
    select net.http_post(
      url := 'https://clarity-v1-six.vercel.app/api/notifications/dispatch',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || secret.decrypted_secret,
        'Content-Type', 'application/json'
      ),
      timeout_milliseconds := 10000
    ) as request_id
    from (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'clarity_notification_dispatch_cron_bearer'
      limit 1
    ) as secret;
  $command$;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'clarity-notification-dispatch'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'clarity-notification-dispatch',
    '* * * * *',
    v_command
  );
end;
$scheduler$;
