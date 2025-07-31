import { RegionGroups } from 'twisted/dist/constants'

/**
 * TFT API関連の定数
 */
export const TFT_QUEUE_ID = 1100 // TFT Ranked queue

/**
 * リージョン定義
 */
export const Regions = {
  BRAZIL: 'BR1',
  EU_EAST: 'EUN1',
  EU_WEST: 'EUW1',
  JAPAN: 'JP1',
  KOREA: 'KR',
  LATIN_AMERICA_NORTH: 'LA1',
  LATIN_AMERICA_SOUTH: 'LA2',
  NORTH_AMERICA: 'NA1',
  OCEANIA: 'OC1',
  TURKEY: 'TR1',
  RUSSIA: 'RU',
  PBE: 'PBE1',
  VIETNAM: 'VN2'
} as const

export type Region = (typeof Regions)[keyof typeof Regions]

/**
 * リージョンからプラットフォームへのマッピング
 */
export const RegionToPlatform: Record<Region, RegionGroups> = {
  BR1: RegionGroups.AMERICAS,
  EUN1: RegionGroups.EUROPE,
  EUW1: RegionGroups.EUROPE,
  JP1: RegionGroups.ASIA,
  KR: RegionGroups.ASIA,
  LA1: RegionGroups.AMERICAS,
  LA2: RegionGroups.AMERICAS,
  NA1: RegionGroups.AMERICAS,
  OC1: RegionGroups.SEA,
  TR1: RegionGroups.EUROPE,
  RU: RegionGroups.EUROPE,
  PBE1: RegionGroups.AMERICAS,
  VN2: RegionGroups.SEA
}

/**
 * ティア定義
 */
export const Tiers = {
  CHALLENGER: 'CHALLENGER',
  GRANDMASTER: 'GRANDMASTER',
  MASTER: 'MASTER',
  DIAMOND: 'DIAMOND',
  EMERALD: 'EMERALD',
  PLATINUM: 'PLATINUM',
  GOLD: 'GOLD',
  SILVER: 'SILVER',
  BRONZE: 'BRONZE',
  IRON: 'IRON'
} as const

export type Tier = (typeof Tiers)[keyof typeof Tiers]

/**
 * プレイヤー情報を表す型
 * ※ Playersで定義しているものと統合
 */
export interface RawPlayerData {
  summonerId: string
  summonerName: string
  puuid: string
  riotTag?: string
  tier: string
  division?: string
  leaguePoints?: number
  wins?: number
  losses?: number
  rank?: string
}

/**
 * マッチデータの型定義
 */
export interface MatchData {
  metadata: {
    match_id: string
    participants: string[]
  }
  info: {
    game_datetime: number
    game_version: string
    participants: ParticipantData[]
    queue_id: number
    tft_set_number: number
    tft_game_type: string
    tft_set_core_name: string
  }
}

export interface ParticipantData {
  puuid: string
  placement: number
  level: number
  gold_left: number
  last_round: number
  time_eliminated: number
  traits: TraitData[]
  units: UnitData[]
  augments: string[]
  companion: {
    content_ID: string
    item_ID: number
    skin_ID: number
    species: string
  }
}

export interface TraitData {
  name: string
  num_units: number
  style: number
  tier_current: number
  tier_total: number
}

export interface UnitData {
  character_id: string
  itemNames: string[]
  items: number[]
  name: string
  rarity: number
  tier: number
}
