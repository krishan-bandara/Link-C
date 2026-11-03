-- SMS schedule (owner decision 2026-10-27): SMS 1 after 30 s offline, SMS 2 +5 min, SMS 3 +10 min.
-- Only overwrite the OLD defaults; values the owner already customised are kept.
update public.sms_settings
   set offline_after_seconds = case when offline_after_seconds = 45 then 30 else offline_after_seconds end,
       step2_after_minutes   = case when step2_after_minutes in (8, 10) then 5 else step2_after_minutes end,
       repeat_every_minutes  = case when repeat_every_minutes = 19 then 10 else repeat_every_minutes end
 where id = 1;

alter table public.sms_settings alter column offline_after_seconds set default 30;
alter table public.sms_settings alter column step2_after_minutes   set default 5;
alter table public.sms_settings alter column repeat_every_minutes  set default 10;
