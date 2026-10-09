-- Behavioural tests for the LushDate schema. Run with supabase/tests/run.sh.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
\o /dev/null

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
select test.ok((public.record_location(:A, 40.712800, -74.006000, '{}') ->> 'verdict') = 'ok', 'location accepted');

select test.ok((public.record_location(:B, 40.7200, -74.0060, '{}') ->> 'verdict') = 'ok', 'location accepted'); -- ~0.5 mi
select test.ok((public.record_location(:C, 40.7560, -74.0060, '{}') ->> 'verdict') = 'ok', 'location accepted'); -- ~3 mi
select test.ok((public.record_location(:D, 40.8290, -74.0060, '{}') ->> 'verdict') = 'ok', 'location accepted'); -- ~8 mi
select test.ok((public.record_location(:E, 40.7130, -74.0050, '{}') ->> 'verdict') = 'ok', 'location accepted');
select test.ok((public.record_location(:F, 40.7130, -74.0050, '{}') ->> 'verdict') = 'ok', 'location accepted');
select test.ok((public.record_location(:G, 40.7130, -74.0050, '{}') ->> 'verdict') = 'ok', 'location accepted');
select test.ok((public.record_location(:K, 40.7130, -74.0050, '{}') ->> 'verdict') = 'ok', 'location accepted');

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


-- ======================================================== trust & safety
\set X '''a0000000-0000-0000-0000-0000000000a1'''
\set R1 '''a0000000-0000-0000-0000-0000000000a2'''
\set R2 '''a0000000-0000-0000-0000-0000000000a3'''
\set R3 '''a0000000-0000-0000-0000-0000000000a4'''
\set Y '''a0000000-0000-0000-0000-0000000000a5'''
\set Z '''a0000000-0000-0000-0000-0000000000a6'''
\set M '''a0000000-0000-0000-0000-0000000000a7'''
\set P '''a0000000-0000-0000-0000-0000000000a8'''
\set Q '''a0000000-0000-0000-0000-0000000000a9'''
\set L '''a0000000-0000-0000-0000-0000000000b1'''
\set BAN '''a0000000-0000-0000-0000-0000000000b2'''
\set EV '''a0000000-0000-0000-0000-0000000000b3'''

insert into auth.users (id) select x::uuid from unnest(array[:X, :R1, :R2, :R3, :Y, :Z, :M, :P, :Q, :L, :BAN, :EV]) x;
insert into public.profiles (id, display_name, birthdate, gender, interested_in, photos)
select x::uuid, 'User', '1995-01-01', 'woman', '{man,woman,nonbinary}', array[x || '/1.jpg']
from unnest(array[:X, :R1, :R2, :R3, :Y, :Z, :M, :P, :Q, :L, :BAN, :EV]) x;

-- ---------------------------------------------------------------- detectors
select test.ok(public.mentions_payment('can you send me $50 on cash app'), 'detects cash app requests');
select test.ok(public.mentions_payment('my $cashtag is $sweetkate'), 'detects cashtags');
select test.ok(public.mentions_payment('I need a steam card for my mom'), 'detects gift card scams');
select test.ok(not public.mentions_payment('dinner is on me, $20 tops lol'), 'ignores ordinary talk about money');
select test.ok(public.mentions_contact('text me 555-123-4567'), 'detects phone numbers');
select test.ok(public.mentions_contact('add me on whatsapp'), 'detects off-platform apps');
select test.ok(not public.mentions_contact('see you at 7 at the cafe'), 'ignores ordinary messages');

-- ------------------------------------------------------- rapid-report freeze
select test.login(:R1); set role authenticated;
insert into public.reports (reported_id, reason) values (:X, 'scam');
reset role;
select test.login(:R2); set role authenticated;
insert into public.reports (reported_id, reason) values (:X, 'fake_profile');
reset role;
select test.ok((select account_status from public.profiles where id = :X) = 'active', 'two reports do not freeze');
select test.login(:R3); set role authenticated;
insert into public.reports (reported_id, reason) values (:X, 'harassment');
reset role;
select test.ok((select account_status from public.profiles where id = :X) = 'frozen', 'three reporters in 24h freeze the account');

select test.login(:X); set role authenticated;
select test.ok(public.my_account_state() ->> 'status' = 'frozen', 'frozen users are told their account is under review');
select test.throws(format('select public.swipe(%L, true)', :Y), 'under review', 'frozen users cannot swipe');
select test.throws('select risk_score from public.profiles', 'permission denied', 'users cannot read risk scores');
select public.submit_appeal('That was not me, please check');
select test.ok((public.my_account_state() ->> 'appeal_open')::boolean, 'frozen users can appeal');
reset role;

set role service_role;
select public.review_account(:X, 'restore', 'false positive');
reset role;
select test.ok((select account_status from public.profiles where id = :X) = 'active', 'a reviewer can restore an account');
select test.ok((select status from public.appeals where user_id = :X) = 'accepted', 'restoring accepts the appeal');

-- ---------------------------------------------------------------- shadowban
select test.login(:Y); set role authenticated; select public.swipe(:Z, true); reset role;
select test.login(:Z); set role authenticated;
create temp table yz as select public.swipe(:Y, true) as id;
reset role;
grant select on yz to authenticated, service_role;
select test.ok((select id from yz) is not null, 'Y and Z match');

set role service_role;
select test.ok(public.apply_risk(:Y, 'test_signal', 65) = 65, 'risk is scored');
reset role;
select test.ok((select account_status from public.profiles where id = :Y) = 'shadowbanned', 'risk 60+ shadowbans');

select test.login(:Y); set role authenticated;
select test.ok(public.my_account_state() ->> 'status' = 'active', 'a shadowban is never revealed');
insert into public.messages (match_id, sender_id, body) select id, :Y, 'hello there' from yz;
select test.ok((select count(*) from public.messages where match_id = (select id from yz)) = 1, 'shadowbanned sender sees their message');
select public.swipe(:M, true);
reset role;
select test.login(:Z); set role authenticated;
select test.ok((select count(*) from public.messages where match_id = (select id from yz)) = 0, 'recipient never sees a shadowbanned message');
reset role;
select test.login(:M); set role authenticated;
select test.ok(public.swipe(:Y, true) is null, 'shadowbanned accounts never get new matches');
select test.ok(not exists (select 1 from public.get_public_profile(:Y)), 'shadowbanned profiles are hidden from non-matches');
reset role;

-- --------------------------------------------------------- message screening
select test.login(:M); set role authenticated; select public.swipe(:R1, true); reset role;
select test.login(:R1); set role authenticated;
create temp table mr as select public.swipe(:M, true) as id;
reset role;
grant select on mr to authenticated, service_role;

select test.login(:M); set role authenticated;
insert into public.messages (match_id, sender_id, body) select id, :M, 'babe can you send me $200 on cash app, my card is blocked' from mr;
insert into public.messages (match_id, sender_id, body) select id, :M, 'add me on whatsapp' from mr;
select test.ok((select held_reason from public.messages where body like 'babe%') = 'payment', 'money requests from new accounts are held');
reset role;
select test.login(:R1); set role authenticated;
select test.ok((select count(*) from public.messages where match_id = (select id from mr)) = 1, 'held money requests never reach the recipient');
select test.ok((select flags from public.messages where match_id = (select id from mr)) = '{contact}', 'contact sharing is delivered with a safety flag');
reset role;
select test.ok(exists (select 1 from public.risk_events where user_id = :M and kind = 'payment_mention'), 'money requests add risk');

-- --------------------------------------------------------- location integrity
select test.ok((public.record_location(:L, 40.7128, -74.0060, '{"accuracy_m": 20}') ->> 'verdict') = 'ok', 'clean location accepted');
select test.ok((public.record_location(:L, 40.7300, -74.0000, '{"mocked": true}') ->> 'verdict') = 'rejected', 'mock locations are rejected');
select test.ok(
  (select extensions.st_y(geo::extensions.geometry) from public.locations where user_id = :L) = round(40.7128 / 0.004) * 0.004,
  'a rejected ping does not move the stored location');
select test.ok(public.record_location(:L, 51.5074, -0.1278, '{}') -> 'reasons' ? 'impossible_travel', 'teleporting across the ocean is rejected');
select test.ok((public.record_location(:L, 40.7130, -74.0050, '{"vpn": true}') ->> 'verdict') = 'suspect', 'VPN users are allowed but marked suspect');
select test.ok(not (select verified from public.locations where user_id = :L), 'suspect locations are not marked verified');
select public.record_location(:L, 40.7130, -74.0050, '{"attestation": "failed"}');
select test.ok((select account_status from public.profiles where id = :L) = 'frozen', 'repeated spoofing freezes the account');
select test.ok((public.record_location(:L, 40.7130, -74.0050, '{}') ->> 'verdict') = 'rejected', 'frozen accounts cannot update location');

select test.login(:A); set role authenticated;
select test.throws('select public.update_location(40.7, -74.0)', 'permission denied', 'clients cannot bypass location checks');
reset role;

-- --------------------------------------------------------------- identity
set role service_role;
select test.ok(public.set_kyc_result(:P, 'approved', 'inq_1', 'hash-person-p') = 'approved', 'KYC approval');
select test.ok(public.set_kyc_result(:Q, 'approved', 'inq_2', 'hash-person-q') = 'approved', 'KYC approval (second person)');
select test.ok(public.set_kyc_result(:EV, 'approved', 'inq_3', 'hash-person-p') = 'duplicate', 'the same ID on a second account is refused');
reset role;
select test.ok((select verification_tier from public.profiles where id = :P) = 2, 'KYC unlocks tier 2');
select test.ok((select kyc_status from public.profiles where id = :EV) = 'rejected', 'duplicate identity is rejected');

update public.profiles set account_status = 'banned' where id = :BAN;
insert into public.devices (device_hash, user_id) values (repeat('ab', 32), :BAN);
select test.login(:EV); set role authenticated;
select public.register_device(repeat('ab', 32));
reset role;
select test.ok((select account_status from public.profiles where id = :EV) = 'frozen', 'a banned person’s device freezes new accounts (ban evasion)');

-- ------------------------------------------------------------ date deposits
select test.login(:P); set role authenticated; select public.swipe(:Q, true); reset role;
select test.login(:Q); set role authenticated;
create temp table pq as select public.swipe(:P, true) as id;
reset role;
grant select on pq to authenticated, service_role;

select test.login(:M); set role authenticated;
select test.throws('select public.propose_date((select id from mr), ''Cafe'', 40.7, -74.0, now() + interval ''1 day'', 300000)',
  'Verify your ID', 'date deposits require ID verification');
reset role;

select test.login(:P); set role authenticated;
select test.throws('select public.propose_date((select id from pq), ''Cafe'', 40.7, -74.0, now() + interval ''10 minutes'', 300000)',
  'between 1 hour and 6 days', 'dates must be 1 hour to 6 days away');
select test.throws('select public.propose_date((select id from pq), ''Cafe'', 40.7, -74.0, now() + interval ''1 day'', 1000000)',
  '₦5,000', 'new accounts have a lower deposit limit');
create temp table plan1 as
  select public.propose_date((select id from pq), 'Blue Bottle Coffee', 40.7410, -73.9897, now() + interval '1 day', 400000) as id;
select test.throws('select public.propose_date((select id from pq), ''Cafe'', 40.7, -74.0, now() + interval ''2 days'', 300000)',
  'already a date', 'one open date per chat');
reset role;
grant select on plan1 to authenticated, service_role;

select test.login(:Q); set role authenticated;
select test.ok(public.respond_date((select id from plan1), true) = 'accepted', 'the invitee accepts');
reset role;

set role service_role;
select test.ok(public.deposit_due(:P, (select id from plan1)) = 400000, 'deposit amount due');
select public.record_deposit_intent((select id from plan1), :P, 'pi_p1', 400000);
select public.record_deposit_intent((select id from plan1), :Q, 'pi_q1', 400000);
select public.mark_deposit('pi_p1', 'authorized');
reset role;
select test.ok((select status from public.date_plans where id = (select id from plan1)) = 'accepted', 'one deposit is not enough');
set role service_role;
select public.mark_deposit('pi_q1', 'authorized');
reset role;
select test.ok((select status from public.date_plans where id = (select id from plan1)) = 'confirmed', 'both holds confirm the date');

update public.date_plans set starts_at = now() where id = (select id from plan1);
set role service_role;
select test.ok((public.record_check_in(:P, (select id from plan1), 40.7411, -73.9898, '{}') ->> 'ok')::boolean, 'check-in at the venue');
select test.ok(public.record_check_in(:Q, (select id from plan1), 40.7600, -73.9800, '{}') ->> 'reason' = 'too_far', 'check-in from elsewhere is refused');
select test.ok(public.record_check_in(:Q, (select id from plan1), 40.7411, -73.9898, '{"mocked": true}') ->> 'reason' = 'location_untrusted', 'spoofed check-in is refused');
update public.date_plans set starts_at = now() - interval '3 hours' where id = (select id from plan1);
select test.ok((select id from plan1) in (select public.plans_to_settle()), 'past dates are queued for settlement');
select test.ok(public.settlement_for((select id from plan1)) = '{"outcome": "no_show", "release": ["pi_p1"], "capture": ["pi_q1"]}'::jsonb,
  'the no-show is charged, the person who came is released');
select test.ok(public.finish_settlement((select id from plan1)) = 'no_show', 'settlement recorded');
select test.ok(public.credit_balance(:P) = 400000, 'the person who came gets the no-show amount as credit');
select test.ok(exists (select 1 from public.risk_events where user_id = :Q and kind = 'no_show'), 'no-shows add risk');
reset role;

select test.login(:Q); set role authenticated;
select test.throws('select public.propose_date((select id from pq), ''Cafe'', 40.7, -74.0, now() + interval ''2 days'', 300000)',
  'aren’t available', 'risky accounts (after a no-show and a spoofed check-in) lose deposit access');
reset role;
set role service_role;
select public.review_account(:Q, 'restore', 'spoofed check-in was a GPS glitch');
reset role;

select test.login(:P); set role authenticated;
create temp table plan2 as
  select public.propose_date((select id from pq), 'Park', 40.7410, -73.9897, now() + interval '2 days', 300000) as id;
reset role;
grant select on plan2 to authenticated, service_role;
select test.login(:Q); set role authenticated; select public.respond_date((select id from plan2), true); reset role;
set role service_role;
select test.ok(public.deposit_due(:P, (select id from plan2)) = 0, 'credit covers the next deposit');
select public.deposit_with_credit((select id from plan2), :P);
reset role;
select test.login(:P); set role authenticated;
select test.ok(public.my_credit_balance() = 100000, 'credit is spent on the deposit');
select public.cancel_date((select id from plan2));
reset role;
set role service_role;
select public.finish_settlement((select id from plan2));
select test.ok(public.credit_balance(:P) = 400000, 'cancelling returns credit');
reset role;

select test.login(:M); set role authenticated;
select test.ok(not exists (select 1 from public.date_plans), 'outsiders cannot see date plans');
reset role;

-- ------------------------------------------------------------ paystack payments
set role service_role;
insert into public.billing_customers (user_id, email) values (:M, 'm@example.com');
insert into public.payments (reference, user_id, kind, amount) values ('ld_plus_1', :M, 'plus', 250000);
select test.ok(public.payment_succeeded('ld_plus_1', 250000, 'NGN', 'CUS_m', 30) = 'plus', 'a paid subscription unlocks LushDate+');
select test.ok(public.payment_succeeded('ld_plus_1', 250000, 'NGN', 'CUS_m', 30) = 'duplicate', 'a payment is only applied once');
reset role;
select test.ok((select expires_at from public.entitlements where user_id = :M) between now() + interval '30 days' and now() + interval '32 days',
  'LushDate+ runs for the plan period plus a day of grace');
select test.ok((select customer_code from public.billing_customers where user_id = :M) = 'CUS_m', 'the Paystack customer is linked');
set role service_role;
select test.ok(public.record_renewal('CUS_m', 'T_renew_1', 250000, 'NGN', 30) = 'plus', 'renewals charged by Paystack extend LushDate+');
select test.ok(public.record_renewal('CUS_nobody', 'T_x', 250000, 'NGN', 30) = 'unknown', 'renewals for unknown customers are ignored');
insert into public.payments (reference, user_id, kind, amount) values ('ld_boost_1', :M, 'boost', 100000);
select test.ok(public.payment_succeeded('ld_boost_1', 50000, 'NGN', null, 30) = 'refund', 'an underpaid charge is refunded, not honoured');
insert into public.payments (reference, user_id, kind, amount) values ('ld_boost_2', :M, 'boost', 100000);
select test.ok(public.payment_succeeded('ld_boost_2', 100000, 'GHS', null, 30) = 'refund', 'a charge in the wrong currency is refunded');
insert into public.payments (reference, user_id, kind, amount) values ('ld_boost_3', :M, 'boost', 100000);
select test.ok(public.payment_succeeded('ld_boost_3', 100000, 'NGN', null, 30) = 'boost', 'a paid boost starts');
select test.ok(public.payment_succeeded('ld_nope', 100000, 'NGN', null, 30) = 'unknown', 'unknown references do nothing');
select public.record_deposit_intent((select id from plan2), :Q, 'ld_dep_late', 300000);
insert into public.payments (reference, user_id, kind, plan_id, amount) values ('ld_dep_late', :Q, 'deposit', (select id from plan2), 300000);
select test.ok(public.payment_succeeded('ld_dep_late', 300000, 'NGN', null, 30) = 'refund', 'a deposit paid after the date was cancelled is refunded');
select public.payment_refunded('ld_dep_late');
insert into public.payments (reference, user_id, kind, amount) values ('ld_plus_fail', :M, 'plus', 250000);
select public.payment_failed('ld_plus_fail');
reset role;
select test.ok((select expires_at from public.entitlements where user_id = :M) > now() + interval '60 days', 'a renewal adds a full period');
select test.ok(exists (select 1 from public.boosts where user_id = :M and transaction_id = 'ld_boost_3'), 'the boost is recorded');
select test.ok((select count(*) from public.boosts where user_id = :M) = 1, 'refunded charges grant nothing');
select test.ok((select status from public.payments where reference = 'ld_dep_late') = 'refunded', 'refunds are recorded');
select test.ok((select status from public.payments where reference = 'ld_plus_fail') = 'failed', 'failed charges are recorded');

select test.login(:M); set role authenticated;
select test.ok((select count(*) from public.payments) = 6, 'people can see their own payments');
select test.throws('select * from public.billing_customers', 'permission denied', 'billing details are private');
select test.throws('select public.payment_succeeded(''ld_plus_fail'', 250000, ''NGN'', null, 30)', 'permission denied', 'people cannot mark their own payments as paid');
reset role;
select test.login(:Q); set role authenticated;
select test.ok((select count(*) from public.payments) = 1, 'and nobody else’s');
reset role;

\echo 'All LushDate schema tests passed.'
