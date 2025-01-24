export interface Settings {
  DTTT_API_KEY: string;
  GUILD_ID: string;
  PORT: number;
  DISCORD_TOKEN: string;
  ADVERTISE_STREAM: string;
  ENABLE_LEGACY_BACKEND: boolean;
}

export interface MuteRequest {
  id: string;
  status: boolean;
}
