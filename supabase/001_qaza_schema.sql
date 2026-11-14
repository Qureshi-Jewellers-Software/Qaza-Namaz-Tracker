-- =====================================================================
-- Qaza Namaz Tracker - Supabase Database Setup
-- File: supabase/001_qaza_schema.sql
-- Kahan chalana hai: Supabase Dashboard > SQL Editor > New query > Paste > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) PROFILES: har user ki basic setting
--    (DOB, gender, haiz cloud par SAVE NAHI hote - privacy ke liye)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
    id          uuid primary key references auth.users (id) on delete cascade,
    start_age   smallint not null default 10 check (start_age between 1 and 30),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2) QAZA_ENTRIES: har entry ka record (ledger)
--    Koi entry kabhi edit ya delete nahi hoti.
--    Ghalti theek karne ke liye nayi "correction" ya "undo" entry banti hai.
--
--    delta = baqi qaza par asar
--      initial    : +7913  (shuru ka balance)
--      completed  : -2     (2 qaza ada ki)
--      correction : +3 / -3 (pichli entry theek ki)
--      undo       : pichli entry ka ulta
--    Baqi qaza = SUM(delta)
-- ---------------------------------------------------------------------
create table if not exists public.qaza_entries (
    id               uuid primary key,              -- phone par banti hai (duplicate sync se bachao)
    user_id          uuid not null default auth.uid()
                         references auth.users (id) on delete cascade,
    item             text not null check (item in
                         ('fajr','zuhr','asr','maghrib','isha','witr','roza')),
    kind             text not null check (kind in
                         ('initial','completed','correction','undo')),
    delta            integer not null check (delta <> 0 and delta between -100000 and 100000),
    related_entry_id uuid references public.qaza_entries (id),
    note             text check (char_length(note) <= 200),
    recorded_at      timestamptz not null,           -- phone par kab entry hui
    synced_at        timestamptz not null default now(),
    device_id        text check (char_length(device_id) <= 64),

    -- "completed" hamesha minus, "initial" hamesha plus
    constraint completed_is_negative check (kind <> 'completed' or delta < 0),
    constraint initial_is_positive   check (kind <> 'initial'   or delta > 0),
    -- undo/correction ko batana zaroori hai ke kis entry ke liye hai
    constraint fix_needs_reference   check (kind not in ('undo','correction') or related_entry_id is not null)
);

create index if not exists qaza_entries_user_time_idx
    on public.qaza_entries (user_id, recorded_at desc);

-- ---------------------------------------------------------------------
-- 3) SECURITY: Row Level Security (har user sirf apna data dekhe)
-- ---------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.qaza_entries enable row level security;

-- Profiles: apna profile dekh, bana aur update kar sakte hain
drop policy if exists "own profile select" on public.profiles;
create policy "own profile select" on public.profiles
    for select to authenticated using (id = auth.uid());

drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert" on public.profiles
    for insert to authenticated with check (id = auth.uid());

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
    for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Entries: sirf apni entries dekh aur add kar sakte hain.
-- UPDATE aur DELETE ki koi policy nahi = history kabhi badli nahi ja sakti.
drop policy if exists "own entries select" on public.qaza_entries;
create policy "own entries select" on public.qaza_entries
    for select to authenticated using (user_id = auth.uid());

drop policy if exists "own entries insert" on public.qaza_entries;
create policy "own entries insert" on public.qaza_entries
    for insert to authenticated with check (user_id = auth.uid());

-- Kisi aur user ki entry ko "related" banane se roko
create or replace function public.check_related_entry_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.related_entry_id is not null and not exists (
        select 1 from public.qaza_entries
        where id = new.related_entry_id and user_id = new.user_id
    ) then
        raise exception 'related entry not found for this user';
    end if;
    return new;
end;
$$;

drop trigger if exists qaza_entries_related_owner on public.qaza_entries;
create trigger qaza_entries_related_owner
    before insert on public.qaza_entries
    for each row execute function public.check_related_entry_owner();

-- ---------------------------------------------------------------------
-- 4) BALANCE VIEW: har item ka hisaab (user sirf apna dekhega)
-- ---------------------------------------------------------------------
create or replace view public.my_balances
with (security_invoker = true) as
select
    item,
    coalesce(sum(delta) filter (where kind = 'initial'), 0)              as initial_total,
    coalesce(-sum(delta) filter (where kind <> 'initial'), 0)            as completed_total,
    coalesce(sum(delta), 0)                                              as remaining
from public.qaza_entries
where user_id = auth.uid()
group by item;

-- ---------------------------------------------------------------------
-- 5) NAYE USER KA PROFILE KHUD BANE
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 6) ACCOUNT DELETE: user apna account aur saara data mita sake
-- ---------------------------------------------------------------------
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
    delete from public.qaza_entries where user_id = auth.uid();
    delete from public.profiles     where id      = auth.uid();
    delete from auth.users          where id      = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

revoke all on function public.check_related_entry_owner() from public, anon, authenticated;
revoke all on function public.handle_new_user()          from public, anon, authenticated;
