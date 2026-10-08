-- Behavioural tests for the LushDate schema. Run with supabase/tests/run.sh.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

create schema test;
grant usage on schema test to authenticated, service_role;

create function test.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'FAILED: %', label;
  end if;
  raise notice 'ok - %', label;
end $$;

create function test.throws(query text, pattern text, label text) returns void language plpgsql as $$
begin
  execute query;
  raise exception 'FAILED (no error): %', label;
exception when others then
  if sqlerrm like 'FAILED (no error)%' then
    raise;
  end if;
  if sqlerrm !~* pattern then
    raise exception 'FAILED: % (unexpected error: %)', label, sqlerrm;
  end if;
  raise notice 'ok - %', label;
end $$;
grant execute on all functions in schema test to authenticated, service_role;

\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set C '''cccccccc-0000-0000-0000-000000000003'''
\set D '''dddddddd-0000-0000-0000-000000000004'''
\set E '''eeeeeeee-0000-0000-0000-000000000005'''
\set F '''ffffffff-0000-0000-0000-000000000006'''
\set G '''99999999-0000-0000-0000-000000000007'''
\set K '''12121212-0000-0000-0000-000000000008'''

insert into auth.users (id)
select x::uuid from unnest(array[:A, :B, :C, :D, :E, :F, :G, :K]) x;

-- Helper to impersonate a signed-in user.
create function test.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, false);
$$;

-- ---------------------------------------------------------------- onboarding
select test.login(:A);
set role authenticated;

select test.throws(
  format($q$insert into public.profiles (id, display_name, birthdate, gender, interested_in)
          values (%L, 'Kid', current_date - interval '17 years', 'woman', '{man}')$q$, :A),
  '18 and over', 'under-18 sign-ups are rejected');

select test.throws(
  format($q$insert into public.profiles (id, display_name, birthdate, gender, interested_in)
          values (%L, 'Sneaky', '1990-01-01', 'woman', '{man}')$q$, :B),
  'row-level security', 'cannot create a profile for someone else');

select test.throws(
  format($q$insert into public.profiles (id, display_name, birthdate, gender, interested_in, photos)
          values (%L, 'Ana', '1996-05-01', 'woman', '{man}', '{someone-else/1.jpg}')$q$, :A),
  'own folder', 'photos must live in the owner''s folder');

insert into public.profiles (id, display_name, birthdate, gender, interested_in, photos, bio, age_max)
values (:A, 'Ana', '1996-05-01', 'woman', '{man}', array[:A || '/1.jpg'], 'Coffee first', 45);

select test.throws(
  format($q$update public.profiles set verified = true where id = %L$q$, :A),
  'permission denied', 'users cannot mark themselves verified');
select test.throws(
  format($q$update public.profiles set birthdate = '2015-01-01' where id = %L$q$, :A),
  'permission denied', 'birthdate cannot be changed after sign-up');

reset role;

-- Everyone else (inserted directly; RLS is covered above).
insert into public.profiles (id, display_name, birthdate, gender, interested_in, photos, is_paused, incognito)
values
  (:B, 'Ben',   '1994-02-02', 'man',   '{woman}', array[:B || '/1.jpg'], false, false),
  (:C, 'Cal',   '1992-03-03', 'man',   '{woman}', array[:C || '/1.jpg'], false, false),
  (:D, 'Dev',   '1993-04-04', 'man',   '{woman}', array[:D || '/1.jpg'], false, false),
  (:E, 'Eve',   '1995-05-05', 'woman', '{woman}', array[:E || '/1.jpg'], false, false),
  (:F, 'Finn',  '1991-06-06', 'man',   '{woman}', array[:F || '/1.jpg'], true,  false),
  (:G, 'Gus',   '1990-07-07', 'man',   '{woman}', array[:G || '/1.jpg'], false, true),
  (:K, 'Kai',   '1960-08-08', 'man',   '{woman}', array[:K || '/1.jpg'], false, false);

-- G has LushDate+, so incognito applies to him.
insert into public.entitlements (user_id, product_id, expires_at) values (:G, 'plus_monthly', now() + interval '30 days');

-- ----------------------------------------------------------------- locations
-- A at lower Manhattan; others offset north.
select test.login(:A); set role authenticated;
select public.update_location(40.712800, -74.006000);
reset role;

select test.login(:B); set role authenticated; select public.update_location(40.7200, -74.0060); reset role; -- ~0.5 mi
select test.login(:C); set role authenticated; select public.update_location(40.7560, -74.0060); reset role; -- ~3 mi
select test.login(:D); set role authenticated; select public.update_location(40.8290, -74.0060); reset role; -- ~8 mi
select test.login(:E); set role authenticated; select public.update_location(40.7130, -74.0050); reset role;
select test.login(:F); set role authenticated; select public.update_location(40.7130, -74.0050); reset role;
select test.login(:G); set role authenticated; select public.update_location(40.7130, -74.0050); reset role;
select test.login(:K); set role authenticated; select public.update_location(40.7130, -74.0050); reset role;

select test.ok(
  (select extensions.st_y(geo::extensions.geometry) from public.locations where user_id = :A)
    = round(40.7128 / 0.004) * 0.004,
  'stored latitude is snapped to the grid, not the raw GPS value');
select test.ok(
  (select extensions.st_distance(geo, extensions.st_makepoint(-74.006, 40.7128)::extensions.geography)
   from public.locations where user_id = :A) between 1 and 400,
  'stored point is within the fuzzing cell but not exact');

select test.login(:A); set role authenticated;

select test.throws('select * from public.locations', 'permission denied', 'clients cannot read locations');
select test.throws('select * from public.swipes', 'permission denied', 'clients cannot read swipes');
select test.ok((select count(*) from public.profiles) = 1, 'clients only see their own profile row');

-- ---------------------------------------------------------------------- feed
create temp table feed as select * from public.nearby_profiles(5);
select test.ok((select array_agg(display_name order by distance_mi, display_name) from feed) = '{Ben,Cal}',
  'free 5 mi feed: mutual-preference, unpaused, non-incognito, in age range');
select test.ok((select distance_mi from feed where display_name = 'Ben') = 1, 'distance is a whole-mile bucket');
select test.ok((select active_now from feed where display_name = 'Ben'), 'recently active users are flagged');
select test.ok((select count(*) from public.nearby_profiles(100)) = 2, 'free users are capped at 5 miles');
drop table feed;

reset role;
insert into public.entitlements (user_id, product_id, expires_at) values (:A, 'plus_monthly', now() + interval '30 days');
select test.login(:A); set role authenticated;
select test.ok((select count(*) from public.nearby_profiles(10)) = 3, 'LushDate+ unlocks a bigger radius');
select test.ok(not exists (select 1 from public.nearby_profiles(10) where display_name = 'Kai'),
  'age preferences are applied');
reset role;
delete from public.entitlements where user_id = :A;

-- G (incognito, plus) likes A, and so becomes visible to her.
select test.login(:G); set role authenticated;
select test.ok(public.swipe(:A, true) is null, 'a one-sided like is not a match');
reset role;
select test.login(:A); set role authenticated;
select test.ok(exists (select 1 from public.nearby_profiles(5) where display_name = 'Gus'),
  'incognito users appear to people they liked');

-- ---------------------------------------------------------------- likes/match
select test.ok(public.likes_received_count() = 1, 'free users see how many likes they have');
select test.throws('select * from public.likes_received()', 'LushDate\+ required', 'who-liked-you is a paid perk');

select test.ok(public.swipe(:C, false) is null, 'pass');
select test.ok(not exists (select 1 from public.nearby_profiles(5) where display_name = 'Cal'),
  'swiped profiles leave the feed');
select test.ok(public.swipe(:B, true) is null, 'A likes B');
reset role;

select test.login(:B); set role authenticated;
create temp table m as select public.swipe(:A, true) as id;
select test.ok((select id from m) is not null, 'mutual like creates a match');
select test.ok((select count(*) from public.my_matches()) = 1, 'match appears in my_matches');
reset role;
grant select on m to authenticated, service_role;

-- ------------------------------------------------------------------ messages
select test.login(:B); set role authenticated;
insert into public.messages (match_id, sender_id, body) select id, :B, 'hey!' from m;
select test.throws(
  format($q$insert into public.messages (match_id, sender_id, body) select id, %L, 'spoof' from m$q$, :A),
  'row-level security', 'cannot send as someone else');
reset role;

select test.login(:C); set role authenticated;
select test.ok((select count(*) from public.messages) = 0, 'outsiders cannot read the chat');
select test.throws('insert into public.messages (match_id, sender_id, body) select id, auth.uid(), ''hi'' from m',
  'row-level security', 'outsiders cannot post into the chat');
select test.ok(not public.can_upload_snap((select id from m)::text || '/x.jpg'), 'outsiders cannot upload snaps');
reset role;

-- --------------------------------------------------------------------- snaps
select test.login(:B); set role authenticated;
select test.ok(public.can_upload_snap((select id from m)::text || '/s1.jpg'), 'members can upload snaps');
select test.ok(not public.can_upload_snap('../etc/passwd'), 'garbage snap paths are rejected');
select test.throws(
  'insert into public.messages (match_id, sender_id, kind, media_path) select id, auth.uid(), ''snap'', ''elsewhere/s.jpg'' from m',
  'invalid snap path', 'snap path must be inside the match folder');
insert into public.messages (match_id, sender_id, kind, media_path)
select id, :B, 'snap', id::text || '/s1.jpg' from m;
select test.throws(
  'select public.open_snap((select id from public.messages where kind = ''snap''))',
  'own snap', 'senders cannot reopen their snap');
select test.ok(not public.can_read_snap((select id from m)::text || '/s1.jpg'), 'sender has no storage read access');
reset role;

select test.login(:A); set role authenticated;
select test.ok(not public.can_read_snap((select id from m)::text || '/s1.jpg'),
  'recipient cannot download before opening');
select test.ok(
  public.open_snap((select id from public.messages where kind = 'snap')) = (select id from m)::text || '/s1.jpg',
  'recipient opens the snap');
select test.ok(public.can_read_snap((select id from m)::text || '/s1.jpg'), 'recipient can download right after opening');
select test.throws(
  'select public.open_snap((select id from public.messages where kind = ''snap''))',
  'disappeared', 'a snap can only be opened once');
insert into public.messages (match_id, sender_id, kind) select id, :A, 'screenshot' from m;
reset role;

update public.messages set viewed_at = now() - interval '5 minutes' where kind = 'snap';
select test.login(:A); set role authenticated;
select test.ok(not public.can_read_snap((select id from m)::text || '/s1.jpg'), 'download window closes after 2 minutes');
reset role;

set role service_role;
select test.ok((select array_agg(object_name) from public.snaps_to_purge()) = array[(select id from m)::text || '/s1.jpg'],
  'viewed snaps are queued for purge');
select public.mark_snaps_purged(array[(select id from m)::text || '/s1.jpg']);
select test.ok(not exists (select 1 from public.snaps_to_purge()), 'purged snaps leave the queue');
reset role;

select test.login(:A); set role authenticated;
select test.throws('select public.snaps_to_purge()', 'permission denied', 'purge queue is service-role only');
select test.throws(format('select public.grant_boost(%L, ''tx'', 30)', :A), 'permission denied', 'clients cannot grant boosts');

-- ------------------------------------------------------------------- reports
insert into public.reports (reported_id, reason, details) values (:B, 'harassment', 'test');
select test.ok((select reporter_id from public.reports) = auth.uid(), 'reporter defaults to the caller');
select test.throws(format($q$insert into public.reports (reported_id, reason) values (%L, 'scam')$q$, :A),
  'row-level security', 'cannot report yourself');

-- -------------------------------------------------------------------- blocks
select public.block_user(:B);
select test.ok(not exists (select 1 from public.matches), 'blocking removes the match');
select test.ok((select count(*) from public.messages) = 0, 'blocking removes the chat');
select test.ok(not exists (select 1 from public.get_public_profile(:B)), 'blocked profiles are hidden');
select test.ok((select array_agg(display_name) from public.my_blocks()) = '{Ben}', 'my_blocks lists who I blocked');
reset role;

select test.login(:B); set role authenticated;
select test.ok(not exists (select 1 from public.get_public_profile(:A)), 'blocking is symmetric');
select test.ok(public.swipe(:A, true) is null, 'cannot re-match after a block');
select test.ok(not exists (select 1 from public.my_blocks()), 'my_blocks does not reveal who blocked me');
reset role;

-- -------------------------------------------------------------------- boosts
set role service_role;
select public.grant_boost(:C, 'tx-1', 30);
select public.grant_boost(:C, 'tx-2', 30);
select public.grant_boost(:C, 'tx-2', 30);
reset role;
select test.ok((select count(*) from public.boosts where user_id = :C) = 2, 'boost grants are idempotent per transaction');
select test.ok(
  (select max(ends_at) - min(starts_at) from public.boosts where user_id = :C) = interval '60 minutes',
  'boosts stack back to back');


-- --------------------------------------------------------------- video calls
select test.login(:E); set role authenticated; select public.swipe(:C, true); reset role;
select test.login(:C); set role authenticated;
create temp table cm as select public.swipe(:E, true) as id;
reset role;
grant select on cm to authenticated, service_role;

select test.login(:E); set role authenticated;
select test.throws('select public.start_call((select id from cm))', 'LushDate\+ required', 'starting a video call needs LushDate+');
reset role;

insert into public.entitlements (user_id, product_id, expires_at) values (:C, 'plus_monthly', now() + interval '30 days');
select test.login(:C); set role authenticated;
create temp table c1 as select public.start_call((select id from cm)) as id;
select test.ok((select id from c1) is not null, 'LushDate+ members can start a call');
select test.throws('select public.start_call((select id from cm))', 'already in progress', 'one live call per match');
select test.throws(format('select public.answer_call(%L, true)', (select id from c1)), 'call not found', 'the caller cannot answer their own call');
reset role;
grant select on c1 to authenticated, service_role;

select test.login(:D); set role authenticated;
select test.ok((select count(*) from public.calls) = 0, 'outsiders cannot see calls');
select test.throws(format('select public.answer_call(%L, true)', (select id from c1)), 'call not found', 'outsiders cannot answer');
select test.throws(format('select public.start_call(%L)', (select id from cm)), 'LushDate\+ required|match not found', 'outsiders cannot call into a match');
reset role;

select test.login(:E); set role authenticated;
select test.ok((select count(*) from public.calls) = 1, 'the person being called can see the call');
select test.ok(public.answer_call((select id from c1), true) = 'accepted', 'answering is free');
select public.end_call((select id from c1));
select test.ok((select status from public.calls where id = (select id from c1)) = 'ended', 'either person can hang up');
reset role;

select test.login(:C); set role authenticated;
create temp table c2 as select public.start_call((select id from cm)) as id;
reset role;
grant select on c2 to authenticated, service_role;
update public.calls set created_at = now() - interval '2 minutes' where id = (select id from c2);
select test.login(:E); set role authenticated;
select test.ok(public.answer_call((select id from c2), true) = 'missed', 'a call that rang out cannot be answered');
reset role;

delete from public.entitlements where user_id = :C;
select test.login(:C); set role authenticated;
select test.throws('select public.start_call((select id from cm))', 'LushDate\+ required', 'calling stops when LushDate+ lapses');
reset role;

\echo 'All LushDate schema tests passed.'
