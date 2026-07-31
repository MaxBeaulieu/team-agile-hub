-- Migration 017: make the icebreaker round optional
--
-- Mirrors 016 (skip_mood_checkins): some teams do not want the voice
-- round-robin icebreaker. When the flag is set the Icebreaker phase is
-- dropped from the phase order, so the retro goes Check-In -> Write (or
-- straight to Write when the mood check-ins are skipped too).

alter table retro_sessions
  add column if not exists skip_icebreaker boolean not null default false;
