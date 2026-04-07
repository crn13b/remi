-- ─── profiles table ───────────────────────────────────────────────────────────
-- One row per auth user. Created automatically on signup via trigger.

create type public.plan_type as enum ('free', 'core', 'pro', 'founder');

create table public.profiles (
    id                     uuid primary key references auth.users(id) on delete cascade,
    plan                   public.plan_type not null default 'free',
    stripe_customer_id     text unique,
    stripe_subscription_id text unique,
    -- when the current period ends (used to handle grace periods if needed)
    subscription_period_end timestamptz,
    created_at             timestamptz not null default now(),
    updated_at             timestamptz not null default now()
);

-- Keep updated_at current
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger profiles_updated_at
    before update on public.profiles
    for each row execute function public.handle_updated_at();

-- Auto-create a free profile for every new user
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
    insert into public.profiles (id)
    values (new.id)
    on conflict (id) do nothing;
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Row-level security: users can only read their own profile
alter table public.profiles enable row level security;

create policy "Users can read own profile"
    on public.profiles for select
    using (auth.uid() = id);

-- Service role (used by the Edge Function) can do anything
create policy "Service role full access"
    on public.profiles for all
    using (auth.role() = 'service_role');
