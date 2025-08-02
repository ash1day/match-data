import 'dotenv/config'
import { collectMatchesFromAllRegions } from './collect-matches'
import { Regions, Tiers } from './common/types'

/**
 * Riot APIデータ取得のメインエントリーポイント（Git版）
 */
export async function fetchRiotData(): Promise<void> {
  // 取得対象のリージョンとティア
  const regions = [
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

  const tiers = [Tiers.CHALLENGER, Tiers.GRANDMASTER, Tiers.MASTER]

  console.log('Starting Riot API data fetch (Git version)...')
  console.log(`Target regions: ${regions.join(', ')}`)
  console.log(`Target tiers: ${tiers.join(', ')}`)

  try {
    // 10万試合を上限として全プレイヤーのデータを収集
    const maxMatches = 100000
    console.log(`Match limit: ${maxMatches.toLocaleString()} matches`)
    await collectMatchesFromAllRegions(regions, tiers, maxMatches)
    console.log('Riot API data fetch completed successfully')
  } catch (error) {
    console.error('Failed to fetch Riot API data:', error)
    throw error
  }
}

// CLIから直接実行される場合
if (require.main === module) {
  fetchRiotData()
    .then(() => {
      console.log('Process completed')
    })
    .catch((error) => {
      console.error('Process failed:', error)
      process.exit(1)
    })
}
