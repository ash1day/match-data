import 'dotenv/config'
import { collectMatchesFromAllRegions } from './collect-matches'
import { Regions, Tiers, type Region } from './common/types'

/**
 * コマンドライン引数をパース
 */
function parseArgs(): { maxMatches?: number; regions?: Region[] } {
  const args = process.argv.slice(2)
  const result: { maxMatches?: number; regions?: Region[] } = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith('--max-matches=')) {
      result.maxMatches = parseInt(arg.split('=')[1], 10)
    } else if (arg.startsWith('--regions=')) {
      const regionList = arg.split('=')[1].split(',')
      result.regions = regionList.map(r => r.trim() as Region)
    }
  }

  return result
}

/**
 * Riot APIデータ取得のメインエントリーポイント（Git版）
 */
export async function fetchRiotData(): Promise<void> {
  const args = parseArgs()
  
  // デフォルトの取得対象のリージョンとティア
  const allRegions = [
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

  const regions = args.regions || allRegions
  const tiers = [Tiers.CHALLENGER, Tiers.GRANDMASTER, Tiers.MASTER]
  const maxMatches = args.maxMatches || 100000

  console.log('Starting Riot API data fetch (Git version)...')
  console.log(`Target regions: ${regions.join(', ')}`)
  console.log(`Target tiers: ${tiers.join(', ')}`)

  try {
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
