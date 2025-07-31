import type { TftApi } from 'twisted'
import type { MatchTFTDTO } from 'twisted/dist/models-dto'

import { batchGetWithFlowRestriction, REQUEST_BUFFER_RATE, createTftApi } from './utils/riot-api-utils'
import { sortedVersionDateNums } from './constants/version-constants'
import { DateService } from './utils/date-service'

import type { Region, Tier } from './common/types'
import { RegionToPlatform, TFT_QUEUE_ID } from './common/types'
import { saveMatchData, initDataRepo, saveMatchIndex, filterNewMatchIds, commitAndPushAllData } from './git-match-store'
import { formatGameVersionToPatch } from './utils/match-utils'
import { Players } from './common/players'
import { MATCH_LIST_API_RATE_LIMIT, MATCH_DETAIL_API_RATE_LIMIT, _REGION_PLAYER_COUNTS } from './common/constants'

/**
 * Playersからプレイヤー一覧を取得
 */
async function getPlayersFromCache(players: Players, region: Region, tiers: Tier[]): Promise<string[]> {
  console.log(`  Loading players from cache...`)

  const allPlayers = await players.getAllPlayers(region)
  console.log(`  Found ${allPlayers.length} cached players`)

  // Note: ランクリセット後はティアフィルタリングは意味がないが、互換性のため残す
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
  // 今日の日付から最も近い過去のパッチ日付を見つける
  const today = DateService.todayNum()
  let latestPatchDate = sortedVersionDateNums[0]

  // 今日より前の最新パッチ日付を探す
  for (const dateNum of sortedVersionDateNums) {
    if (dateNum <= today) {
      latestPatchDate = dateNum
      break
    }
  }

  // 日付を Date オブジェクトに変換
  const date = DateService.numToDate(latestPatchDate)

  console.log(`  Using patch start date: ${DateService.numToDateString(latestPatchDate)} (${latestPatchDate})`)

  // Unix タイムスタンプ（秒）に変換
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
): Promise<MatchTFTDTO[]> {
  console.log(`\nCollecting matches from ${region}...`)

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

  console.log(`  Fetching match IDs...`)
  const matchIdArrays = await batchGetWithFlowRestriction<string[], [typeof regionGroup]>(
    matchListWithParams,
    uniquePuuids,
    [regionGroup],
    MATCH_LIST_API_RATE_LIMIT,
    REQUEST_BUFFER_RATE
  )

  const allMatchIds = Array.from(new Set(matchIdArrays.flat()))
  console.log(`  Found ${allMatchIds.length} match IDs from API`)

  // 既存のマッチIDをチェック（パッチは後で決定）
  console.log(`  Will fetch match details to determine latest patch`)

  // 上限が設定されている場合はランダムに選択
  let matchIdsToFetch = allMatchIds
  if (maxMatches && allMatchIds.length > maxMatches) {
    const shuffled = [...allMatchIds].sort(() => Math.random() - 0.5)
    matchIdsToFetch = shuffled.slice(0, maxMatches)
    console.log(`  Limited to ${matchIdsToFetch.length} matches`)
  }

  // マッチ詳細を取得
  if (matchIdsToFetch.length === 0) {
    return []
  }

  console.log(`  Fetching match details...`)

  // 大量のマッチIDを小さなバッチに分割して処理（メモリ効率化）
  const BATCH_SIZE = 500 // 一度に処理する最大マッチ数
  const allMatches: MatchTFTDTO[] = []

  for (let i = 0; i < matchIdsToFetch.length; i += BATCH_SIZE) {
    const batch = matchIdsToFetch.slice(i, i + BATCH_SIZE)
    console.log(
      `  Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(matchIdsToFetch.length / BATCH_SIZE)} (${batch.length} matches)`
    )

    const batchData = await batchGetWithFlowRestriction<MatchTFTDTO, [typeof regionGroup]>(
      api.Match.get.bind(api.Match),
      batch,
      [regionGroup],
      MATCH_DETAIL_API_RATE_LIMIT,
      REQUEST_BUFFER_RATE
    )

    allMatches.push(...batchData)

    // メモリ使用量をログ出力
    const memUsage = process.memoryUsage()
    console.log(
      `  Memory usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
    )
  }

  const matchesData = allMatches

  // TFTマッチのみフィルタ
  const tftMatches = matchesData.filter((match) => {
    return match.info.queue_id === TFT_QUEUE_ID
  })

  // 全てのパッチを収集してから最新パッチを判定
  const patchCounts = new Map<string, number>()
  tftMatches.forEach((match) => {
    const patchNum = formatGameVersionToPatch(match.info.game_version)
    const patch = (patchNum / 100).toFixed(2)
    patchCounts.set(patch, (patchCounts.get(patch) || 0) + 1)
  })

  // 最新パッチを決定（最も大きいパッチ番号）
  let latestPatch = ''
  let latestPatchNum = 0
  for (const [patch, count] of patchCounts.entries()) {
    const patchNum = parseFloat(patch) * 100
    if (patchNum > latestPatchNum) {
      latestPatchNum = patchNum
      latestPatch = patch
    }
    console.log(`  Found ${count} matches for patch ${patch}`)
  }

  if (!latestPatch) {
    console.log(`  No matches found from ${region}`)
    return []
  }

  // 最新パッチのマッチのみをフィルタ
  const latestPatchMatches = tftMatches.filter((match) => {
    const patchNum = formatGameVersionToPatch(match.info.game_version)
    const patch = (patchNum / 100).toFixed(2)
    return patch === latestPatch
  })

  // 既存のマッチIDをチェックして新規のみを返す
  const latestMatchIds = latestPatchMatches.map((m) => m.metadata.match_id)
  const newMatchIds = await filterNewMatchIds(latestMatchIds, latestPatch, region)
  const cachedCount = latestMatchIds.length - newMatchIds.length

  console.log(`  Found ${latestPatchMatches.length} matches for latest patch ${latestPatch}`)
  console.log(`  Cached: ${cachedCount} | New: ${newMatchIds.length}`)

  // 新規マッチのみを返す
  const newMatches = latestPatchMatches.filter((m) => newMatchIds.includes(m.metadata.match_id))

  // 取得できたマッチのIDをインデックスに保存
  if (newMatches.length > 0) {
    const collectedIds = newMatches.map((match) => match.metadata.match_id)
    await saveMatchIndex(collectedIds, latestPatch, region)
  }

  return newMatches
}

/**
 * すべてのリージョンからマッチを収集（Git版）
 */
export async function collectMatchesFromAllRegions(
  regions: Region[],
  tiers: Tier[],
  totalMatchLimit?: number
): Promise<void> {
  // Gitリポジトリ初期化
  await initDataRepo()

  const api = createTftApi()
  const players = new Players()

  console.log('Starting match collection from all regions (Git version)...')

  // 各リージョンのマッチ数制限を計算（プレイヤー数比に応じて配分）
  const matchesPerRegionMap: Record<string, number> = {}
  if (totalMatchLimit) {
    // 対象リージョンの合計プレイヤー数を計算
    const totalPlayers = regions.reduce((sum, region) => {
      return sum + (_REGION_PLAYER_COUNTS[region] || 1000) // デフォルト値1000
    }, 0)

    // 各リージョンのマッチ数を計算
    regions.forEach((region) => {
      const regionPlayers = _REGION_PLAYER_COUNTS[region] || 1000
      const ratio = regionPlayers / totalPlayers
      matchesPerRegionMap[region] = Math.ceil(totalMatchLimit * ratio)
    })

    console.log('Match allocation by region (based on player counts):')
    regions.forEach((region) => {
      const players = _REGION_PLAYER_COUNTS[region] || 1000
      console.log(`  ${region}: ${matchesPerRegionMap[region]} matches (${players} players)`)
    })
  }

  let totalMatches = 0
  const matchCountsByPatch: Record<string, number> = {} // カウントのみ保持

  for (const region of regions) {
    try {
      const matchLimit = matchesPerRegionMap[region]
      const matches = await collectMatchesFromRegion(api, players, region, tiers, matchLimit)

      if (matches.length === 0) {
        console.log(`No matches found for ${region}`)
        continue
      }

      // パッチ番号でグループ化
      const matchesByPatch: Record<string, MatchTFTDTO[]> = {}
      matches.forEach((match) => {
        const patchNum = formatGameVersionToPatch(match.info.game_version)
        const patch = (patchNum / 100).toFixed(2)

        if (!matchesByPatch[patch]) {
          matchesByPatch[patch] = []
        }
        matchesByPatch[patch].push(match)
      })

      // パッチごとにローカルファイルに保存（Git操作は後で一括）
      for (const [patch, patchMatches] of Object.entries(matchesByPatch)) {
        await saveMatchData(patchMatches, patch, region)

        // カウントのみ保持（メモリ節約）
        if (!matchCountsByPatch[patch]) {
          matchCountsByPatch[patch] = 0
        }
        matchCountsByPatch[patch] += patchMatches.length
      }

      totalMatches += matches.length

      // メモリをすぐに開放
      matches.length = 0

      // 総マッチ数制限のチェック
      if (totalMatchLimit && totalMatches >= totalMatchLimit) {
        console.log(`Reached total match limit (${totalMatchLimit}). Stopping collection.`)
        break
      }
    } catch (error) {
      console.error(`Failed to collect matches from ${region}:`, error)
    }
  }

  // サマリー表示
  console.log('\n=== Collection Summary ===')
  console.log(`Total matches collected: ${totalMatches}`)
  console.log('\nMatches by patch:')
  Object.entries(matchCountsByPatch).forEach(([patch, count]) => {
    console.log(`  Patch ${patch}: ${count} matches`)
  })

  // 全データを一括でGitにコミット・プッシュ
  if (totalMatches > 0) {
    const patchList = Object.keys(matchCountsByPatch).sort().join(', ')
    const summary = `Collected ${totalMatches} matches from ${regions.length} regions (patches: ${patchList})`
    console.log('\n📦 Committing all data to Git...')
    await commitAndPushAllData(summary)
  }
}
