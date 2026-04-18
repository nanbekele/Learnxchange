create table if not exists public.user_search_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text,
  category text,
  availability text,
  created_at timestamptz not null default now()
);

alter table public.user_search_events enable row level security;

create policy "Users can insert own search events" on public.user_search_events
  for insert to authenticated
  with check (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "Users can view own search events" on public.user_search_events
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create index if not exists user_search_events_user_created_idx
  on public.user_search_events (user_id, created_at desc);
