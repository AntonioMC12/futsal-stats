begin;

create table teams (
  id uuid primary key,
  seed_key text unique,
  name text not null,
  short_name varchar(5) not null,
  logo text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0)
);

create table players (
  id uuid primary key,
  team_id uuid not null references teams(id) on delete restrict,
  number smallint not null check (number between 0 and 99),
  name text not null,
  position text,
  active boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0)
);

create index players_team_id_idx on players(team_id);

create table matches (
  id uuid primary key,
  team_id uuid not null references teams(id) on delete restrict,
  home_team_name text not null,
  home_team_short_name varchar(5) not null,
  opponent_name text not null,
  opponent_short_name varchar(5) not null,
  match_date timestamptz not null,
  status text not null check (status in ('setup', 'ready', 'firstHalf', 'halftime', 'secondHalf', 'finished')),
  current_period smallint not null check (current_period > 0),
  period_count smallint not null check (period_count > 0),
  clock jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0)
);

create index matches_team_id_idx on matches(team_id);
create index matches_team_date_idx on matches(team_id, match_date desc);
create unique index matches_one_active_per_team_idx
  on matches(team_id)
  where deleted_at is null and status in ('ready', 'firstHalf', 'halftime', 'secondHalf');

create table match_players (
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete restrict,
  in_squad boolean not null default true,
  is_starter boolean not null default false,
  primary key (match_id, player_id),
  check (not is_starter or in_squad)
);

create index match_players_player_id_idx on match_players(player_id);

create table match_events (
  id uuid primary key,
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid references players(id) on delete restrict,
  out_player_id uuid references players(id) on delete restrict,
  in_player_id uuid references players(id) on delete restrict,
  target_event_id uuid references match_events(id) on delete no action deferrable initially deferred,
  reduction_event_id uuid references match_events(id) on delete no action deferrable initially deferred,
  event_type text not null,
  period smallint not null check (period > 0),
  game_clock_ms integer not null check (game_clock_ms >= 0),
  sequence integer not null check (sequence > 0),
  occurred_at timestamptz not null,
  undone boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (match_id, sequence)
);

create index match_events_match_id_idx on match_events(match_id);
create index match_events_match_sequence_idx on match_events(match_id, sequence, occurred_at);
create index match_events_player_id_idx on match_events(player_id) where player_id is not null;

create table match_event_lineup_players (
  event_id uuid not null references match_events(id) on delete cascade,
  player_id uuid not null references players(id) on delete restrict,
  position smallint not null check (position >= 0),
  primary key (event_id, player_id),
  unique (event_id, position)
);

create index match_event_lineup_players_player_id_idx on match_event_lineup_players(player_id);

commit;
