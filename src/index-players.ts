import * as dotenv from 'dotenv'

dotenv.config({ override: true })

import { collectPlayers } from './collect-players'
import { Players } from './common/players'
import type { Region } from './common/types'
import { Regions, Tiers } from './common/types'
import { createTftApi } from './utils/riot-api-utils'

/**
 * プレイヤーデータ収集のメインエントリーポイント（Git版）
 */
export async function collectPlayersData(): Promise<void> {
  const api = createTftApi()
  const players = new Players()

  // コマンドライン引数の処理
  const args = process.argv.slice(2)
  const regionsArg = args.find((arg) => arg.startsWith('--regions='))

  // 収集対象のリージョンとティア
  let regions: Region[] = [
    Regions.JAPAN,
    Regions.KOREA,
    Regions.EU_WEST,
    Regions.NORTH_AMERICA,
    Regions.BRAZIL,
    Regions.EU_EAST,
    Regions.LATIN_AMERICA_NORTH,
    Regions.LATIN_AMERICA_SOUTH,
    Regions.OCEANIA,
    Regions.TURKEY,
    Regions.VIETNAM
  ]

  // --regions 引数が指定された場合、そのリージョンのみを使用
  if (regionsArg) {
    const regionsList = regionsArg.split('=')[1].split(',')
    regions = regionsList.map((r) => r.trim() as Region)
    console.log(`Using specified regions: ${regions.join(', ')}`)
  }

  const tiers = [Tiers.CHALLENGER, Tiers.GRANDMASTER, Tiers.MASTER, Tiers.DIAMOND]

  console.log('Starting player data collection (Git version)...')
  console.log(`Target regions: ${regions.join(', ')}`)
  console.log(`Target tiers: ${tiers.join(', ')}`)

  // 並列処理でリージョンを収集（3リージョンずつバッチ処理してAPI制限を回避）
  const BATCH_SIZE = 3
  for (let i = 0; i < regions.length; i += BATCH_SIZE) {
    const batch = regions.slice(i, i + BATCH_SIZE)
    console.log(
      `\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(regions.length / BATCH_SIZE)}: ${batch.join(', ')}`
    )

    const results = await Promise.allSettled(
      batch.map(async (region) => {
        try {
          console.log(`[${region}] Starting collection...`)
          const collected = await collectPlayers(api, players, region, tiers)
          console.log(`[${region}] Completed: ${collected} players`)
          return { region, collected }
        } catch (error) {
          console.error(`[${region}] Failed:`, error)
          throw error
        }
      })
    )

    // 結果をログ出力
    for (const result of results) {
      if (result.status === 'fulfilled') {
        console.log(`[${result.value.region}] ✓ Success: ${result.value.collected} players`)
      } else {
        console.error(`[${result.reason}] ✗ Failed`)
      }
    }
  }

  console.log('\nPlayer collection completed')
}

// CLIから直接実行される場合
if (require.main === module) {
  collectPlayersData()
    .then(() => {
      console.log('Process completed')
    })
    .catch((error) => {
      console.error('Process failed:', error)
      process.exit(1)
    })
}
