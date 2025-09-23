import type { TftApi } from 'twisted'
import type { MatchTFTDTO } from 'twisted/dist/models-dto'

import { batchGetWithFlowRestriction, REQUEST_BUFFER_RATE, createTftApi } from './utils/riot-api-utils'
import { sortedVersionDateNums } from './constants/version-constants'
import { DateService } from './utils/date-service'

import type { Region, Tier } from './common/types'
import { RegionToPlatform, TFT_QUEUE_ID } from './common/types'
import { saveMatchData, saveMatchIndex, filterNewMatchIds, initDataStore, finalizeDataStore } from './s3-match-store'
import { gameVersionToPatchDir } from './utils/patch-utils'
import { updateMetadata, aggregateMetadata } from './metadata'
import { Players } from './common/players'
import { MATCH_LIST_API_RATE_LIMIT, MATCH_DETAIL_API_RATE_LIMIT } from './common/constants'
import { loadPatchConfig } from './utils/patch-filter'

const patchConfig = loadPatchConfig()
if (patchConfig.collectOnlyLatest && patchConfig.targetPatch) {
  console.log(`  📋 Loaded patch config: Target patch ${patchConfig.targetPatch}`)
}

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
 * 最新パッチの開始日時を取得
 */
function getLatestPatchStartTime(): number {
  const today = DateService.todayNum()
  let latestPatchDate = sortedVersionDateNums[0]

  for (const dateNum of sortedVersionDateNums) {
    if (dateNum <= today) {
      latestPatchDate = dateNum
      break
    }
  }

  const date = DateService.numToDate(latestPatchDate)
  console.log(`  Using patch start date: ${DateService.numToDateString(latestPatchDate)} (${latestPatchDate})`)

  return Math.floor(date.getTime() / 1000)
}

/**
 * リージョンからマッチを収集
 */
async function collectMatchesFromRegion(
  api: TftApi,
  players: Players,
  region: Region,
  tiers: Tier[],
  maxMatches?: number
): Promise<void> {
  console.log(`\n📍 Collecting matches from ${region}...`)

  // PlayerCacheからプレイヤーを取得
  let uniquePuuids = await getPlayersFromCache(players, region, tiers)

  // マッチ数制限がある場合のみプレイヤー数を制限
  if (maxMatches) {
    const playersToFetch = Math.min(uniquePuuids.length, Math.ceil(maxMatches / 20))
    uniquePuuids = uniquePuuids.slice(0, playersToFetch)
    console.log(`  Limited to ${playersToFetch} players due to match limit`)
  }

  // マッチIDを取得（最新パッチの開始日以降）
  const regionGroup = RegionToPlatform[region]
  const startTime = getLatestPatchStartTime()

  const matchListWithParams = async (puuid: string, rg: typeof regionGroup) => {
    return api.Match.list(puuid, rg, { count: 100, startTime })
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

  // パッチごとにグループ化
  const matchesByPatch = new Map<string, MatchTFTDTO[]>()
  const allPatches = new Set<string>()

  // まず全てのパッチを収集
  for (const match of matches) {
    try {
      const patch = gameVersionToPatchDir(match.info.game_version)
      allPatches.add(patch)

      if (!matchesByPatch.has(patch)) {
        matchesByPatch.set(patch, [])
      }
      matchesByPatch.get(patch)!.push(match)
    } catch (error) {
      console.warn('  Failed to parse patch from game version:', match.info.game_version, error)
      continue
    }
  }

  // パッチのフィルタリング - 常に最新のパッチから取得
  const sortedPatches = Array.from(allPatches).sort((a, b) => {
    const [aMajor, aMinor] = a.split('.').map(Number)
    const [bMajor, bMinor] = b.split('.').map(Number)
    if (bMajor !== aMajor) return bMajor - aMajor
    return bMinor - aMinor
  })

  // 複数のパッチがある場合、最新のものから順に処理
  // マッチ数制限に達するまで複数パッチから取得可能
  console.log(`  📊 Available patches: ${sortedPatches.join(', ')}`)

  if (patchConfig.collectOnlyLatest && patchConfig.targetPatch) {
    // 設定ファイルで特定のパッチが指定されている場合のみそのパッチを使用（後方互換性）
    const targetPatch = patchConfig.targetPatch
    const otherPatches = sortedPatches.filter((p) => p !== targetPatch)

    if (matchesByPatch.has(targetPatch)) {
      console.log(`  📌 Using specified target patch: ${targetPatch}`)
      if (otherPatches.length > 0) {
        console.log(`  ⚠️ Skipping other patches: ${otherPatches.join(', ')}`)
        for (const patch of otherPatches) {
          matchesByPatch.delete(patch)
        }
      }
    } else {
      console.log(`  ⚠️ Target patch ${targetPatch} not found, using latest patches instead`)
    }
  } else {
    // デフォルト: 最新のパッチから順に取得（マッチ数制限まで）
    console.log(`  📌 Collecting from latest patches (newest first)`)
  }

  // パッチごとに保存（新規マッチのみ）
  for (const [patch, patchMatches] of matchesByPatch) {
    console.log(`\n  Processing patch ${patch}...`)

    // 既存のマッチIDと比較して新規のみフィルタリング
    const matchIds = patchMatches.map((m) => m.metadata.match_id)
    const newMatchIds = await filterNewMatchIds(matchIds, region, patch)

    if (newMatchIds.length === 0) {
      console.log(`  No new matches for ${patch}`)
      continue
    }

    // 新規マッチのみ取得
    const newMatches = patchMatches.filter((m) => newMatchIds.includes(m.metadata.match_id))

    // データを保存（既存データとマージ）
    await saveMatchData(newMatches, region, patch)
    await saveMatchIndex(newMatchIds, region, patch)

    console.log(`  ✅ Saved ${newMatches.length} new matches for ${patch}`)
  }

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
): Promise<void> {
  const api = createTftApi()
  const players = new Players()
  const patchStats = new Map<string, Map<string, number>>()

  try {
    // S3から既存データをダウンロード（スキップオプションあり）
    if (!skipDownload) {
      await initDataStore()
    } else {
      console.log('⚠️ Skipping S3 download')
    }

    // 各リージョンからマッチを収集
    for (const region of regions) {
      try {
        await collectMatchesFromRegion(api, players, region, tiers, maxMatches)

        // TODO: 実際のマッチ数を集計してpatchStatsに追加
        // この実装は後で改善が必要
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
      await finalizeDataStore()
    } else {
      console.log('⚠️ Skipping S3 upload')
    }
  } catch (error) {
    console.error('❌ Fatal error during collection:', error)
    throw error
  }
}
