import { TftApi } from 'twisted'
import type { RegionGroups } from 'twisted/dist/constants'
import type { MatchTFTDTO } from 'twisted/dist/models-dto'

const api = new TftApi({
  key: process.env.RIOT_API_KEY!,
  rateLimitRetry: true,
  rateLimitRetryAttempts: 5
})

/**
 * Fetch match IDs for a player
 */
export async function fetchMatchIds(puuid: string, region: string, count = 20): Promise<string[]> {
  try {
    const response = await api.Match.list(puuid, getRouteRegion(region) as RegionGroups, { count })
    return response.response
  } catch (error) {
    console.error(`Failed to fetch match IDs for ${puuid}:`, error)
    return []
  }
}

/**
 * Fetch match data by match ID
 */
export async function fetchMatchData(matchId: string, region: string): Promise<MatchTFTDTO | null> {
  try {
    const response = await api.Match.get(matchId, getRouteRegion(region) as RegionGroups)
    return response.response
  } catch (error) {
    console.error(`Failed to fetch match ${matchId}:`, error)
    return null
  }
}

/**
 * Convert region to route region for match API
 */
function getRouteRegion(region: string): string {
  const routeMap: Record<string, string> = {
    BR1: 'AMERICAS',
    EUN1: 'EUROPE',
    EUW1: 'EUROPE',
    JP1: 'ASIA',
    KR: 'ASIA',
    LA1: 'AMERICAS',
    LA2: 'AMERICAS',
    NA1: 'AMERICAS',
    OC1: 'SEA',
    PH2: 'SEA',
    RU: 'EUROPE',
    SG2: 'SEA',
    TH2: 'SEA',
    TR1: 'EUROPE',
    TW2: 'SEA',
    VN2: 'SEA'
  }

  return routeMap[region] || 'ASIA'
}
