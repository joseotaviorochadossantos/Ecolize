create table if not exists public.availability_responses (
  id text primary key check (char_length(id) <= 120),
  display_name text not null check (char_length(display_name) between 1 and 100),
  votes jsonb not null default '{}'::jsonb check (jsonb_typeof(votes) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.availability_responses enable row level security;

grant select, insert, update on public.availability_responses to anon, authenticated;
revoke delete on public.availability_responses from anon, authenticated;

drop policy if exists "Public can read availability responses" on public.availability_responses;
create policy "Public can read availability responses"
  on public.availability_responses
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public can add availability responses" on public.availability_responses;
create policy "Public can add availability responses"
  on public.availability_responses
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Public can update availability responses" on public.availability_responses;
create policy "Public can update availability responses"
  on public.availability_responses
  for update
  to anon, authenticated
  using (true)
  with check (true);
