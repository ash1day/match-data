import * as dotenv from 'dotenv'
dotenv.config({ override: true })
import { createTftApi } from './utils/riot-api-utils'

import { Players } from './common/players'
import { Regions, Tiers } from './common/types'
import { collectPlayers } from './collect-players'

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
  let regions = [
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
    regions = regionsList.map((r) => r.trim() as Regions)
    console.log(`Using specified regions: ${regions.join(', ')}`)
  }

  const tiers = [Tiers.CHALLENGER, Tiers.GRANDMASTER, Tiers.MASTER, Tiers.DIAMOND, Tiers.PLATINUM]

  console.log('Starting player data collection (Git version)...')
  console.log(`Target regions: ${regions.join(', ')}`)
  console.log(`Target tiers: ${tiers.join(', ')}`)

  for (const region of regions) {
    try {
      console.log(`\nCollecting players from ${region}...`)
      const collected = await collectPlayers(api, players, region, tiers)
      console.log(`Collected ${collected} new players from ${region}`)
    } catch (error) {
      console.error(`Failed to collect players from ${region}:`, error)
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
