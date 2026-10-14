-- Sri Guru HR Consultants — database, storage and security rules.
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- Security model
--   • Website visitors never touch these tables directly. Every form goes to the
--     `submit` Edge Function, which validates it and writes with the service role.
--   • Only signed-in users listed in public.admins can read or update rows and
--     download resumes. There are no INSERT policies, so the public API cannot add rows.

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.candidates (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  status         text not null default 'new'
                 check (status in ('new', 'shortlisted', 'interviewing', 'placed', 'on_hold', 'rejected')),
  name           text not null,
  mobile         text not null,
  email          text,
  position       text not null,
  qualification  text,
  experience     text,
  notice_period  text,
  present_org    text,
  previous_orgs  text,
  ctc_present    text,
  ctc_expected   text,
  languages      text,
  skills         text,
  resume_path    text,
  resume_name    text,
  consent        boolean not null default false,
  admin_notes    text
);

create table if not exists public.vacancies (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  status          text not null default 'new'
                  check (status in ('new', 'in_progress', 'filled', 'closed')),
  company         text not null,
  contact_person  text not null,
  mobile          text not null,
  email           text,
  role            text not null,
  openings        integer check (openings is null or openings between 1 and 10000),
  location        text,
  experience      text,
  requirements    text,
  admin_notes     text
);

create table if not exists public.enquiries (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  status       text not null default 'new'
               check (status in ('new', 'contacted', 'closed')),
  name         text not null,
  company      text,
  email        text,
  phone        text,
  service      text,
  message      text not null,
  admin_notes  text
);

-- People allowed into admin.html (add rows after creating their login).
create table if not exists public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists candidates_created_at_idx on public.candidates (created_at desc);
create index if not exists vacancies_created_at_idx  on public.vacancies  (created_at desc);
create index if not exists enquiries_created_at_idx  on public.enquiries  (created_at desc);

-- ── Admin check ─────────────────────────────────────────────────────────────

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table public.candidates enable row level security;
alter table public.vacancies  enable row level security;
alter table public.enquiries  enable row level security;
alter table public.admins     enable row level security;

-- Admins can read, update and delete; nobody can insert through the public API.
do $$
declare t text;
begin
  foreach t in array array['candidates', 'vacancies', 'enquiries'] loop
    execute format('drop policy if exists "admins read %1$s" on public.%1$I', t);
    execute format('drop policy if exists "admins update %1$s" on public.%1$I', t);
    execute format('drop policy if exists "admins delete %1$s" on public.%1$I', t);
    execute format('create policy "admins read %1$s" on public.%1$I for select to authenticated using (public.is_admin())', t);
    execute format('create policy "admins update %1$s" on public.%1$I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy "admins delete %1$s" on public.%1$I for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- A signed-in user may only see whether they themselves are an admin.
drop policy if exists "read own admin row" on public.admins;
create policy "read own admin row" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- Visitors (anon) get no table access at all.
revoke all on public.candidates, public.vacancies, public.enquiries, public.admins from anon;

-- ── Resume storage (private bucket) ────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes', 'resumes', false, 5242880,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Admins can download (via signed links) and delete resumes. Uploads happen only
-- in the Edge Function with the service role, so there is no INSERT policy.
drop policy if exists "admins read resumes" on storage.objects;
create policy "admins read resumes" on storage.objects
  for select to authenticated using (bucket_id = 'resumes' and public.is_admin());

drop policy if exists "admins delete resumes" on storage.objects;
create policy "admins delete resumes" on storage.objects
  for delete to authenticated using (bucket_id = 'resumes' and public.is_admin());
