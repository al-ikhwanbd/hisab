-- আল ইখওয়ান: সদস্যভিত্তিক লভ্যাংশ Public/Hidden
-- একবার Supabase SQL Editor-এ চালাতে হবে।
create table if not exists public.member_dividend_visibility (
  member_id uuid primary key references public.members(id) on delete cascade,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.member_dividend_visibility enable row level security;

drop policy if exists "member_dividend_visibility_public_read" on public.member_dividend_visibility;
create policy "member_dividend_visibility_public_read"
on public.member_dividend_visibility for select
to anon, authenticated
using (
  is_public = true
  or exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid()
  )
);

drop policy if exists "member_dividend_visibility_admin_insert" on public.member_dividend_visibility;
create policy "member_dividend_visibility_admin_insert"
on public.member_dividend_visibility for insert
to authenticated
with check (
  exists (select 1 from public.admin_users au where au.user_id = auth.uid())
);

drop policy if exists "member_dividend_visibility_admin_update" on public.member_dividend_visibility;
create policy "member_dividend_visibility_admin_update"
on public.member_dividend_visibility for update
to authenticated
using (
  exists (select 1 from public.admin_users au where au.user_id = auth.uid())
)
with check (
  exists (select 1 from public.admin_users au where au.user_id = auth.uid())
);

drop policy if exists "member_dividend_visibility_admin_delete" on public.member_dividend_visibility;
create policy "member_dividend_visibility_admin_delete"
on public.member_dividend_visibility for delete
to authenticated
using (
  exists (select 1 from public.admin_users au where au.user_id = auth.uid())
);
