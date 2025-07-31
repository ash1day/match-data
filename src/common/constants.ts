/**
 * Riot API のレート制限定数
 */

// API Rate Limits
export const LEAGUE_API_RATE_LIMIT = 3 // 270 requests every 1 minutes
export const SUMMONER_API_RATE_LIMIT = 25 // 1600 requests every 1 minutes
export const MATCH_LIST_API_RATE_LIMIT = 60 // 600 requests every 10 seconds
export const MATCH_DETAIL_API_RATE_LIMIT = 25 // 250 requests every 10 seconds

// 各リージョンの高ティアプレイヤー数（2025-06-24調査）
export const _REGION_PLAYER_COUNTS: { [key: string]: number } = {
  JP1: 3573,
  BR1: 3478,
  EUN1: 3674,
  EUW1: 10600,
  KR: 10900,
  LA1: 1627,
  LA2: 1792,
  NA1: 10715,
  OC1: 1349,
  TR1: 2741,
  VN2: 11350
}
