-- Migration 016: make the mood check-in steps optional (EE-165)
--
-- Some teams run a retro without the entry/exit mood ritual. The facilitator
-- now decides at creation time; when the flag is set the session starts
-- straight in the Icebreaker phase and the wrap-up hides the mood widgets.

alter table retro_sessions
  add column if not exists skip_mood_checkins boolean not null default false;
