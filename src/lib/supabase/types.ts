/**
 * Hand-rolled row types for the lobby schema.
 *
 * Once the schema stabilizes we'll regenerate these via:
 *
 *   npx supabase gen types typescript --linked > src/lib/supabase/types.ts
 *
 * For now they're hand-maintained and must be kept in sync with
 * supabase/migrations/0001_lobby.sql. Each interface mirrors a row;
 * the `Insert` variants relax server-defaulted columns so callers
 * can omit them.
 */

export type GameModeRow = "facilitated" | "self_guided";
export type GameVisibilityRow = "public" | "private";
export type GameStatusRow = "lobby" | "playing" | "ended";

export interface GameRow {
  id: string;
  name: string;
  mode: GameModeRow;
  visibility: GameVisibilityRow;
  status: GameStatusRow;
  join_code: string | null;
  max_teams: number;
  current_quarter: number;
  board_decisions_enabled: boolean;
  created_by_session_id: string;
  facilitator_session_id: string | null;
  locked: boolean;
  started_at: string | null;
  ended_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface GameInsert {
  id?: string;
  name: string;
  mode: GameModeRow;
  visibility: GameVisibilityRow;
  status?: GameStatusRow;
  join_code?: string | null;
  max_teams?: number;
  current_quarter?: number;
  board_decisions_enabled?: boolean;
  created_by_session_id: string;
  facilitator_session_id?: string | null;
  locked?: boolean;
  started_at?: string | null;
  ended_at?: string | null;
}

export interface GameMemberRow {
  id: string;
  game_id: string;
  session_id: string;
  role: "player" | "host" | "facilitator" | "spectator";
  team_id: string | null;
  display_name: string | null;
  connected_at: string;
  last_seen_at: string;
  // Phase 9 — server-enforced unique color id from the AIRLINE_COLOR_PALETTE.
  // Nullable so legacy rows (pre-0004) and pre-pick rows don't break the type.
  airline_color_id: string | null;
}

export interface GameMemberInsert {
  id?: string;
  game_id: string;
  session_id: string;
  role?: GameMemberRow["role"];
  team_id?: string | null;
  display_name?: string | null;
  airline_color_id?: string | null;
}

/** Snapshot of the engine GameState. The `state_json` shape matches
 *  the `GameState` interface in src/types/game.ts; we keep it as
 *  jsonb so engine changes don't require schema migrations during
 *  active development. */
export interface GameStateRow {
  game_id: string;
  version: number;
  state_json: unknown;  // GameState — but the lobby layer doesn't need
                        // to introspect; the engine deserializes when
                        // the play page hydrates.
  updated_at: string;
}

export interface GameEventRow {
  id: string;
  game_id: string;
  actor_session_id: string | null;
  actor_team_id: string | null;
  type: string;
  payload_json: unknown;
  created_at: string;
}

export interface GameEventInsert {
  id?: string;
  game_id: string;
  actor_session_id?: string | null;
  actor_team_id?: string | null;
  type: string;
  payload_json?: unknown;
}

export interface UserPreferenceRow {
  id: string;
  user_id: string;
  pref_key: string;
  value_json: unknown;
  created_at: string;
  updated_at: string;
}

export interface UserPreferenceInsert {
  id?: string;
  user_id: string;
  pref_key: string;
  value_json?: unknown;
}

export interface GamePreferenceRow {
  id: string;
  game_id: string;
  user_id: string;
  pref_key: string;
  value_json: unknown;
  created_at: string;
  updated_at: string;
}

export interface GamePreferenceInsert {
  id?: string;
  game_id: string;
  user_id: string;
  pref_key: string;
  value_json?: unknown;
}

export interface GameSnapshotRow {
  id: string;
  game_id: string;
  quarter: number;
  saved_by_user_id: string;
  label: string;
  quarter_label: string;
  team_count: number;
  state_json: unknown;
  created_at: string;
  updated_at: string;
}

export interface GameSnapshotInsert {
  id?: string;
  game_id: string;
  quarter: number;
  saved_by_user_id: string;
  label: string;
  quarter_label: string;
  team_count: number;
  state_json: unknown;
}

/** Convenience union for the four tables — used by the typed client
 *  so a single helper can write to any of them with type safety.
 *  Shape mirrors what `supabase gen types` emits for v2 (postgrest 12)
 *  so a future regeneration drops in cleanly. The `__InternalSupabase`
 *  block is required by @supabase/supabase-js v2.47+ for the generic
 *  client to resolve tables correctly. */
export interface Database {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      games: {
        Row: GameRow;
        Insert: GameInsert;
        Update: Partial<GameInsert>;
        Relationships: [];
      };
      game_members: {
        Row: GameMemberRow;
        Insert: GameMemberInsert;
        Update: Partial<GameMemberInsert>;
        Relationships: [];
      };
      game_state: {
        Row: GameStateRow;
        Insert: { game_id: string; state_json: unknown; version?: number };
        Update: { state_json?: unknown; version?: number };
        Relationships: [];
      };
      game_events: {
        Row: GameEventRow;
        Insert: GameEventInsert;
        Update: Partial<GameEventInsert>;
        Relationships: [];
      };
      user_preferences: {
        Row: UserPreferenceRow;
        Insert: UserPreferenceInsert;
        Update: Partial<UserPreferenceInsert>;
        Relationships: [];
      };
      game_preferences: {
        Row: GamePreferenceRow;
        Insert: GamePreferenceInsert;
        Update: Partial<GamePreferenceInsert>;
        Relationships: [];
      };
      game_snapshots: {
        Row: GameSnapshotRow;
        Insert: GameSnapshotInsert;
        Update: Partial<GameSnapshotInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
