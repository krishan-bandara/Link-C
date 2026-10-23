-- The owner decides the SMS limit per day in Admin > SMS. It is ONE shared count for all members together (an umbrella). The default is 75.
alter table public.sms_settings alter column daily_cap set default 75;
update public.sms_settings set daily_cap = 75 where id = 1;
