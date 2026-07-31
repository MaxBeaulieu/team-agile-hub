-- Migration 018: drop the Epics feature
--
-- Epics (and their KPIs) were introduced in 003_epics_and_talking_points.sql as
-- a lightweight OKR-style tracker. The team decided not to track epics/OKRs in
-- this app, so the tables and the optional focus_topics -> epics link are gone.

alter table focus_topics
  drop column if exists epic_id;

drop table if exists epic_kpis;
drop table if exists epics;
