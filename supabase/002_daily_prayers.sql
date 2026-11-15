-- =====================================================================
-- Qaza Namaz Tracker - 002: Rozana (aaj ki) namazon ka record
-- Kahan chalana hai: Supabase Dashboard > SQL Editor > New query > Paste > Run
--
-- Kya karta hai:
--  * qaza_entries mein naya kind 'missed' (+1): jo rozana namaz ada nahi hui, woh qaza mein judti hai
--  * for_day column: missed entry kis din ki hai
--  * daily_status table: har din har namaz ka haal (prayed / missed)
--  * fill_missed_days(): app shuru hone se kal tak jin namazon ka haal darj nahi, unhein qaza mein daal deta hai
-- =====================================================================

-- 1) qaza_entries: naya kind 'missed' + for_day
alter table public.qaza_entries add column if not exists for_day date;

alter table public.qaza_entries drop constraint if exists qaza_entries_kind_check;
alter table public.qaza_entries add constraint qaza_entries_kind_check
    check (kind in ('initial','completed','correction','undo','missed'));

alter table public.qaza_entries drop constraint if exists missed_is_positive;
alter table public.qaza_entries add constraint missed_is_positive
    check (kind <> 'missed' or (delta > 0 and for_day is not null and item <> 'roza'));

-- 2) daily_status: har din har namaz ka haal
create table if not exists public.daily_status (
    user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
    day        date not null,
    prayer     text not null check (prayer in ('fajr','zuhr','asr','maghrib','isha','witr')),
    status     text not null check (status in ('prayed','missed')),
    updated_at timestamptz not null default now(),
    primary key (user_id, day, prayer)
);

alter table public.daily_status enable row level security;

drop policy if exists "own daily select" on public.daily_status;
create policy "own daily select" on public.daily_status
    for select to authenticated using (user_id = auth.uid());

drop policy if exists "own daily insert" on public.daily_status;
create policy "own daily insert" on public.daily_status
    for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own daily update" on public.daily_status;
create policy "own daily update" on public.daily_status
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.daily_status to authenticated;

-- 3) Purane din jin ka haal darj nahi -> qaza mein (sirf apne liye, RLS ke sath)
create or replace function public.fill_missed_days(p_start date, p_today date)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
    n integer := 0;
begin
    if auth.uid() is null then
        raise exception 'not logged in';
    end if;
    if p_start is null or p_today is null or p_start >= p_today then
        return 0;
    end if;
    -- hifazat: zyada se zyada 2 saal pichhe tak
    if p_today - p_start > 730 then
        p_start := p_today - 730;
    end if;

    with ins as (
        insert into public.daily_status (user_id, day, prayer, status)
        select auth.uid(), d::date, p, 'missed'
        from generate_series(p_start, p_today - 1, interval '1 day') as d
        cross join unnest(array['fajr','zuhr','asr','maghrib','isha','witr']) as p
        on conflict (user_id, day, prayer) do nothing
        returning day, prayer
    )
    insert into public.qaza_entries (id, user_id, item, kind, delta, recorded_at, for_day, note, device_id)
    select gen_random_uuid(), auth.uid(), prayer, 'missed', 1, now(), day, 'Ada nahi ki (khud)', 'auto'
    from ins;

    get diagnostics n = row_count;
    return n;
end;
$$;

revoke all on function public.fill_missed_days(date, date) from public, anon;
grant execute on function public.fill_missed_days(date, date) to authenticated;

-- 4) Account delete: daily_status bhi saaf ho
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'not logged in';
    end if;
    delete from public.daily_status where user_id = auth.uid();
    delete from public.qaza_entries where user_id = auth.uid();
    delete from public.profiles     where id      = auth.uid();
    delete from auth.users          where id      = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
