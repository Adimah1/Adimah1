-- LushDate database reset: wipes everything setup.sql created so it can be run again.
-- Use it when setup.sql stops with "already exists" (an earlier run got part-way).
-- WARNING: deletes all app data (profiles, matches, messages...). Sign-in accounts are kept.

drop policy if exists "photos: owner upload" on storage.objects;
drop policy if exists "photos: owner read" on storage.objects;
drop policy if exists "photos: owner delete" on storage.objects;
drop policy if exists "snaps: upload to my matches" on storage.objects;
drop policy if exists "snaps: recipient reads once" on storage.objects;
drop policy if exists "verifications: owner upload" on storage.objects;

drop schema if exists public cascade;
create schema public;

-- Supabase's standard grants on the public schema.
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all functions in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
