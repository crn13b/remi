-- asset_last_call — per-symbol latched "last call" state.
-- One row per asset (symbol-keyed). Shared across users because the market
-- is the same for everyone. Writes happen only via upsert_asset_last_call.

create table if not exists public.asset_last_call (
    symbol text primary key,

    -- Base call fields (all-null or all-populated together, enforced below).
    last_call_score integer,
    last_call_side text check (last_call_side in ('bullish', 'bearish')),
    last_call_price numeric,
    last_call_at timestamptz,

    -- Peak-score tracking: best score reached during the current call.
    last_call_peak_score integer,
    last_call_peak_score_at timestamptz,

    -- Peak-favorable-move tracking: signed decimal ratio, e.g. 0.152 or -0.083.
    last_call_peak_move numeric,
    last_call_peak_move_at timestamptz,

    updated_at timestamptz default now() not null,

    constraint asset_last_call_base_coherent check (
        (
            last_call_score is null
            and last_call_side is null
            and last_call_price is null
            and last_call_at is null
        )
        or (
            last_call_score is not null
            and last_call_side is not null
            and last_call_price is not null
            and last_call_at is not null
        )
    )
);

-- RLS lockdown: enable RLS, define no policies → neither authenticated nor
-- anon can read or write. Service role bypasses RLS.
alter table public.asset_last_call enable row level security;

-- Upsert RPC.
--
-- Modes:
--   'new_call'    — overwrite base fields; reset peak fields to current state.
--   'peak_update' — update peak score iff new value is a better peak
--                   for the latched side (bullish higher, bearish lower).
--   'move_update' — update peak move iff new value is more favorable
--                   for the latched side (bullish higher, bearish lower).
--
-- All three modes are single statements with inline comparison, making them
-- race-safe against concurrent callers.
create or replace function public.upsert_asset_last_call(
    p_symbol text,
    p_mode text,
    p_score integer default null,
    p_side text default null,
    p_price numeric default null,
    p_call_at timestamptz default null,
    p_peak_score integer default null,
    p_peak_score_at timestamptz default null,
    p_peak_move numeric default null,
    p_peak_move_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_mode = 'new_call' then
        -- A new call overwrites base state and resets peak tracking to the
        -- entry point. Subsequent peak_update / move_update calls will
        -- ratchet from here.
        insert into public.asset_last_call (
            symbol,
            last_call_score, last_call_side, last_call_price, last_call_at,
            last_call_peak_score, last_call_peak_score_at,
            last_call_peak_move, last_call_peak_move_at,
            updated_at
        ) values (
            p_symbol,
            p_score, p_side, p_price, p_call_at,
            p_score, p_call_at,
            0.0, p_call_at,
            now()
        )
        on conflict (symbol) do update set
            last_call_score = excluded.last_call_score,
            last_call_side = excluded.last_call_side,
            last_call_price = excluded.last_call_price,
            last_call_at = excluded.last_call_at,
            last_call_peak_score = excluded.last_call_peak_score,
            last_call_peak_score_at = excluded.last_call_peak_score_at,
            last_call_peak_move = excluded.last_call_peak_move,
            last_call_peak_move_at = excluded.last_call_peak_move_at,
            updated_at = now();

    elsif p_mode = 'peak_update' then
        update public.asset_last_call
        set last_call_peak_score = p_peak_score,
            last_call_peak_score_at = p_peak_score_at,
            updated_at = now()
        where symbol = p_symbol
          and (
              (last_call_side = 'bullish' and p_peak_score > coalesce(last_call_peak_score, -1))
              or
              (last_call_side = 'bearish' and p_peak_score < coalesce(last_call_peak_score, 101))
          );

    elsif p_mode = 'move_update' then
        update public.asset_last_call
        set last_call_peak_move = p_peak_move,
            last_call_peak_move_at = p_peak_move_at,
            updated_at = now()
        where symbol = p_symbol
          and (
              (last_call_side = 'bullish' and p_peak_move > coalesce(last_call_peak_move, -1e9))
              or
              (last_call_side = 'bearish' and p_peak_move < coalesce(last_call_peak_move, 1e9))
          );

    else
        raise exception 'upsert_asset_last_call: unknown mode %', p_mode;
    end if;
end;
$$;

-- Access control: service-role only.
revoke all on function public.upsert_asset_last_call(
    text, text, integer, text, numeric, timestamptz, integer, timestamptz, numeric, timestamptz
) from public;
revoke all on function public.upsert_asset_last_call(
    text, text, integer, text, numeric, timestamptz, integer, timestamptz, numeric, timestamptz
) from anon;
revoke all on function public.upsert_asset_last_call(
    text, text, integer, text, numeric, timestamptz, integer, timestamptz, numeric, timestamptz
) from authenticated;
