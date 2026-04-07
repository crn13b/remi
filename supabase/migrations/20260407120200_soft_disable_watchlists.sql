-- Ensure watchlists support soft-disable for downgrade reconciliation.
alter table public.watchlists
  add column if not exists is_active boolean not null default true;

create index if not exists watchlists_user_active_idx
  on public.watchlists (user_id) where is_active = true;
