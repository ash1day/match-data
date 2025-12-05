import type { TftApi } from 'twisted'
import type { MatchTFTDTO } from 'twisted/dist/models-dto'

import { batchGetWithFlowRestriction, REQUEST_BUFFER_RATE, createTftApi } from './utils/riot-api-utils'

import type { Region, Tier } from './common/types'
import { Regions, RegionToPlatform, Tiers } from './common/types'
import { saveMatchData, saveMatchIndex, filterNewMatchIds, initDataStore, finalizeDataStore } from './s3-match-store'
import { gameVersionToPatchDir, patchToNumber } from './utils/patch-utils'
import { Players } from './common/players'
import { MATCH_LIST_API_RATE_LIMIT, MATCH_DETAIL_API_RATE_LIMIT } from './common/constants'

/**
 * Playersからプレイヤー一覧を取得
 */
async function getPlayersFromCache(players: Players, region: Region, tiers: Tier[]): Promise<string[]> {
  console.log(`  Loading players from cache...`)

  const allPlayers = await players.getAllPlayers(region)
  console.log(`  Found ${allPlayers.length} cached players`)

  const filteredPlayers = allPlayers.filter((player) => tiers.includes(player.tier as Tier))
  if (filteredPlayers.length < allPlayers.length) {
    console.log(`  Filtered to ${filteredPlayers.length} players (based on cached tier data)`)
  }

  return filteredPlayers.map((player) => player.puuid)
}

/**
 * JPサーバーの上位プレイヤーから最新パッチを動的に検出
 */
async function detectLatestPatch(api: TftApi, players: Players): Promise<string> {
  console.log('\n🔍 Detecting latest patch from JP server...')

  // JPサーバーから200人のプレイヤーを取得
  const jpPlayers = await players.getAllPlayers(Regions.JAPAN)
  const samplePuuids = jpPlayers.slice(0, 200).map((p) => p.puuid)
  console.log(`  Sampling ${samplePuuids.length} players from JP...`)

  const regionGroup = RegionToPlatform[Regions.JAPAN]

  // 各プレイヤーの最新1試合を取得
  const matchListWithParams = async (puuid: string, rg: typeof regionGroup) => {
    return api.Match.list(puuid, rg, { count: 1 })
  }

  const matchIdArrays = await batchGetWithFlowRestriction<string[], [typeof regionGroup]>(
    matchListWithParams,
    samplePuuids,
    [regionGroup],
    MATCH_LIST_API_RATE_LIMIT,
    0.5
  )

  const matchIds = matchIdArrays.flat().slice(0, 50) // 50試合で十分
  console.log(`  Fetched ${matchIds.length} match IDs...`)

  // マッチ詳細を取得してパッチを抽出
  const matchDetailWithParams = async (matchId: string, rg: typeof regionGroup) => {
    return api.Match.get(matchId, rg)
  }

  const matches = await batchGetWithFlowRestriction<MatchTFTDTO, [typeof regionGroup]>(
    matchDetailWithParams,
    matchIds,
    [regionGroup],
    MATCH_DETAIL_API_RATE_LIMIT,
    0.5
  )

  // 最新パッチを特定
  let latestPatch = '0.0'
  let latestPatchNum = 0

  for (const match of matches) {
    try {
      const patch = gameVersionToPatchDir(match.info.game_version)
      const patchNum = patchToNumber(patch)
      if (patchNum > latestPatchNum) {
        latestPatchNum = patchNum
        latestPatch = patch
      }
    } catch {
      // ignore invalid version
    }
  }

  console.log(`  ✅ Detected latest patch: ${latestPatch}`)
  return latestPatch
}

/**
 * リージョンからマッチを収集
 */
async function collectMatchesFromRegion(
  api: TftApi,
  players: Players,
  region: Region,
  tiers: Tier[],
  latestPatch: string,
  maxMatches?: number
): Promise<void> {
  console.log(`\n📍 Collecting matches from ${region} (patch: ${latestPatch})...`)

  // PlayerCacheからプレイヤーを取得
  let uniquePuuids = await getPlayersFromCache(players, region, tiers)

  // マッチ数制限がある場合のみプレイヤー数を制限
  if (maxMatches) {
    const playersToFetch = Math.min(uniquePuuids.length, Math.ceil(maxMatches / 20))
    uniquePuuids = uniquePuuids.slice(0, playersToFetch)
    console.log(`  Limited to ${playersToFetch} players due to match limit`)
  }

  // マッチIDを取得
  const regionGroup = RegionToPlatform[region]

  const matchListWithParams = async (puuid: string, rg: typeof regionGroup) => {
    return api.Match.list(puuid, rg, { count: 100 })
  }

  console.log(`  Fetching match IDs from API...`)
  const matchIdArrays = await batchGetWithFlowRestriction<string[], [typeof regionGroup]>(
    matchListWithParams,
    uniquePuuids,
    [regionGroup],
    MATCH_LIST_API_RATE_LIMIT,
    REQUEST_BUFFER_RATE
  )

  const allMatchIds = Array.from(new Set(matchIdArrays.flat()))
  console.log(`  Found ${allMatchIds.length} total match IDs from API`)

  // マッチ詳細を取得（パッチごとに処理）
  const matchDetailWithParams = async (matchId: string, rg: typeof regionGroup) => {
    return api.Match.get(matchId, rg)
  }

  console.log(`  Fetching match details...`)
  const matches = await batchGetWithFlowRestriction<MatchTFTDTO, [typeof regionGroup]>(
    matchDetailWithParams,
    allMatchIds.slice(0, maxMatches),
    [regionGroup],
    MATCH_DETAIL_API_RATE_LIMIT,
    REQUEST_BUFFER_RATE
  )

  // 最新パッチのマッチのみフィルタリング
  const latestPatchMatches: MatchTFTDTO[] = []

  for (const match of matches) {
    try {
      const patch = gameVersionToPatchDir(match.info.game_version)
      if (patch === latestPatch) {
        latestPatchMatches.push(match)
      }
    } catch (error) {
      console.warn('  Failed to parse patch from game version:', match.info.game_version, error)
      continue
    }
  }

  console.log(`  📊 Found ${latestPatchMatches.length} matches for patch ${latestPatch} (${matches.length} total fetched)`)

  if (latestPatchMatches.length === 0) {
    console.log(`  ⚠️ No matches found for latest patch ${latestPatch}`)
    console.log(`✅ Completed ${region}`)
    return
  }

  // 既存のマッチIDと比較して新規のみフィルタリング
  const matchIds = latestPatchMatches.map((m) => m.metadata.match_id)
  const newMatchIds = await filterNewMatchIds(matchIds, region, latestPatch)

  if (newMatchIds.length === 0) {
    console.log(`  No new matches for ${latestPatch}`)
    console.log(`✅ Completed ${region}`)
    return
  }

  // 新規マッチのみ取得
  const newMatches = latestPatchMatches.filter((m) => newMatchIds.includes(m.metadata.match_id))

  // データを保存（既存データとマージ）
  await saveMatchData(newMatches, region, latestPatch)
  await saveMatchIndex(newMatchIds, region, latestPatch)

  console.log(`  ✅ Saved ${newMatches.length} new matches for ${latestPatch}`)
  console.log(`✅ Completed ${region}`)
}

/**
 * 全リージョンからマッチを収集
 */
export async function collectMatchesFromAllRegions(
  regions: Region[],
  tiers: Tier[],
  maxMatches?: number,
  skipDownload?: boolean,
  skipUpload?: boolean
): Promise<string> {
  const api = createTftApi()
  const players = new Players()

  try {
    // S3から既存データをダウンロード（スキップオプションあり）
    if (!skipDownload) {
      await initDataStore()
    } else {
      console.log('⚠️ Skipping S3 download')
    }

    // 最新パッチを動的に検出
    const latestPatch = await detectLatestPatch(api, players)

    // 各リージョンからマッチを収集
    for (const region of regions) {
      try {
        await collectMatchesFromRegion(api, players, region, tiers, latestPatch, maxMatches)
      } catch (error) {
        console.error(`❌ Error collecting from ${region}:`, error)
        // エラーが発生してもほかのリージョンは続行
      }
    }

    // メタデータを更新（現時点では集計機能は未実装）
    // await aggregateMetadata(patchStats)

    // S3にアップロード（スキップオプションあり）
    if (!skipUpload) {
      console.log('\n📤 Uploading all data to S3...')
      await finalizeDataStore(latestPatch)
    } else {
      console.log('⚠️ Skipping S3 upload')
    }

    return latestPatch
  } catch (error) {
    console.error('❌ Fatal error during collection:', error)
    throw error
  }
}
