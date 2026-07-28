-- Private Storage bucket for the "Future You" photo reshape.
--
-- Only the future-self-reshape edge function (service role) ever touches this
-- bucket: it uploads the user's selfie, hands Perfect Corp a short-lived
-- signed URL, then deletes the input. No public access and no user-facing RLS
-- policies are needed — service-role access bypasses RLS, and nothing else
-- should read these selfies.
insert into storage.buckets (id, name, public)
values ('future-self', 'future-self', false)
on conflict (id) do nothing;
