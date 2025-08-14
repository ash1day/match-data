import type { TftApi } from 'twisted'
import { Regions as TwistedRegions, Divisions } from 'twisted/dist/constants'

import type { Region, Tier } from './common/types'
import { Tiers } from './common/types'
import type { Players } from './common/players'
import { type PlayerInfo } from './common/players'
import { BaseCollector } from './common/base-collector'

/**
 * 指定ティアのプレイヤー一覧を取得
 */
async function fetchLeagueEntries(api: TftApi, region: Region, tier: Tier): Promise<any[]> {
  console.log(`  Fetching ${tier} league entries...`)

  // Convert our Region type to twisted's Regions enum
  const twistedRegion = region as unknown as TwistedRegions

  if (tier === Tiers.CHALLENGER) {
    const league = await api.League.getChallengerLeague(twistedRegion)
    return league.response.entries
  } else if (tier === Tiers.GRANDMASTER) {
    const league = await api.League.getGrandMasterLeague(twistedRegion)
    return league.response.entries
  } else if (tier === Tiers.MASTER) {
    const league = await api.League.getMasterLeague(twistedRegion)
    return league.response.entries
  } else if (tier === Tiers.DIAMOND || tier === Tiers.PLATINUM || tier === Tiers.GOLD || tier === Tiers.SILVER || tier === Tiers.BRONZE || tier === Tiers.IRON) {
    // DIAMOND以下のティアはgetByTierDivisionを使用
    // 各ディビジョン(I, II, III, IV)を取得して結合
    const allEntries: any[] = []
    const divisions = [Divisions.I, Divisions.II, Divisions.III, Divisions.IV]
    
    for (const division of divisions) {
      console.log(`    Fetching ${tier} ${division} league entries...`)
      let page = 1
      let hasMore = true
      
      while (hasMore) {
        try {
          const response = await api.League.getByTierDivision(
            twistedRegion,
            tier as any, // Tiers enum from twisted
            division,
            page
          )
          
          if (response.response.length > 0) {
            allEntries.push(...response.response)
            page++
            // Riot APIは通常1ページあたり205エントリーを返す
            if (response.response.length < 200) {
              hasMore = false
            }
          } else {
            hasMore = false
          }
        } catch (error) {
          console.log(`      No more pages for ${tier} ${division} (page ${page})`)
          hasMore = false
        }
      }
    }
    
    return allEntries
  }

  return []
}

/**
 * プレイヤーの詳細情報を取得してPlayerInfo形式に変換
 */
async function fetchPlayerDetails(_api: TftApi, leagueEntry: any, _region: Region, tier: Tier): Promise<PlayerInfo> {
  // League entryにPUUIDが含まれているため、Summoner APIは不要
  // Account APIはアクセス権限がないため、riotTagは空文字列のまま
  // 注意: League APIはsummonerIdを返さないため、puuidをsummonerIdとして使用

  return {
    summonerId: leagueEntry.puuid,  // League APIにはsummonerIdがないため、puuidを使用
    summonerName: '', // League entryには名前が含まれていないため空文字列
    puuid: leagueEntry.puuid,
    riotTag: '', // Account APIアクセス権限なし
    tier,
    division: leagueEntry.rank || undefined,
    leaguePoints: leagueEntry.leaguePoints
  }
}

/**
 * 単一リージョンのプレイヤー情報を収集
 */
async function collectPlayersFromRegion(api: TftApi, region: Region, tiers: Tier[], players: Players): Promise<number> {
  console.log(`\nProcessing ${region}...`)

  let totalPlayers = 0
  const allPlayers: PlayerInfo[] = []

  // 各ティアのプレイヤーを取得
  for (const tier of tiers) {
    const entries = await fetchLeagueEntries(api, region, tier)
    console.log(`  Found ${entries.length} ${tier} players`)

    // summonerIdのリストを作成
    const summonerIds = entries.map((entry) => entry.summonerId)

    // キャッシュに存在しないプレイヤーのみ取得
    const missingIds = await players.getMissingPlayers(summonerIds, region)
    console.log(`  ${missingIds.length} new players to fetch (${entries.length - missingIds.length} cached)`)

    if (missingIds.length > 0) {
      // 新規プレイヤーの詳細情報を取得
      // League entryから直接情報を取得できるため、API呼び出しは不要
      const missingEntries = entries.filter((entry) => missingIds.includes(entry.summonerId))
      const playerDetails = missingEntries.map((entry) => fetchPlayerDetails(api, entry, region, tier))

      allPlayers.push(...(await Promise.all(playerDetails)))
    }

    totalPlayers += entries.length
  }

  // 新規プレイヤーをキャッシュに追加
  if (allPlayers.length > 0) {
    await players.upsertPlayers(allPlayers, region)
    await players.savePlayers(region)
    console.log(`  Saved ${allPlayers.length} new players to cache`)
  }

  const totalCached = players.getPlayerCount(region)
  console.log(`  Total players in cache: ${totalCached}`)

  return totalPlayers
}

/**
 * プレイヤー情報収集クラス
 */
class PlayerCollector extends BaseCollector {
  protected _getCollectionName(): string {
    return 'Collecting Player Information'
  }

  protected _getItemName(): string {
    return 'players'
  }

  protected async _collectFromRegion(region: Region, tiers: Tier[]): Promise<number> {
    return collectPlayersFromRegion(this.api, region, tiers, this.players)
  }
}

/**
 * 全リージョンのプレイヤー情報を収集してキャッシュに保存
 *
 * @param regions 対象リージョン
 * @param tiers 対象ティア
 */
export async function collectPlayersFromAllRegions(regions: Region[], tiers: Tier[]): Promise<void> {
  const collector = new PlayerCollector()
  await collector.collectFromAllRegions(regions, tiers)
}

/**
 * 単一リージョンのプレイヤー情報を収集（index-players.ts用）
 */
export async function collectPlayers(api: TftApi, players: Players, region: Region, tiers: Tier[]): Promise<number> {
  return collectPlayersFromRegion(api, region, tiers, players)
}
