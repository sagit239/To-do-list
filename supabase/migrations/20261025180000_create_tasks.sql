-- Shared task list (ARCHITECTURE 2.3) with a dedicated backend role (ADR-2).
-- Prerequisite, done once by hand in every project: create user app_backend with password '...';
-- Written to be safe to re-run on the Dev project.

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       varchar(100) null,
  description varchar(2000) null,
  due_date    date null,
  completed   boolean not null default false,
  position    integer not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tasks_title_or_description check (
    (title is not null and title ~ '\S')
    or (description is not null and description ~ '\S')
  ),
  constraint tasks_position_non_negative check (position >= 0)
);

create index if not exists tasks_position_id_idx on public.tasks (position, id);

create or replace function public.tasks_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.tasks_set_updated_at();

-- Access: only app_backend; no public access through anon/authenticated.
revoke all on table public.tasks from public, anon, authenticated;
revoke all on function public.tasks_set_updated_at() from public, anon, authenticated;

grant usage on schema public to app_backend;
grant select, insert, update, delete on table public.tasks to app_backend;

alter table public.tasks enable row level security;

drop policy if exists tasks_app_backend_all on public.tasks;
create policy tasks_app_backend_all on public.tasks
  for all to app_backend
  using (true)
  with check (true);
