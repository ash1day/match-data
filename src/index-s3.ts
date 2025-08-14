import * as dotenv from 'dotenv'
dotenv.config({ override: true })
import { collectMatchesFromAllRegions } from './collect-matches-s3'
import { Regions, Tiers, type Region } from './common/types'

/**
 * コマンドライン引数をパース
 */
function parseArgs(): { maxMatches?: number; regions?: Region[]; skipDownload?: boolean; skipUpload?: boolean } {
  const args = process.argv.slice(2)
  const result: { maxMatches?: number; regions?: Region[]; skipDownload?: boolean; skipUpload?: boolean } = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith('--max-matches=')) {
      result.maxMatches = parseInt(arg.split('=')[1], 10)
    } else if (arg.startsWith('--regions=')) {
      const regionList = arg.split('=')[1].split(',')
      result.regions = regionList.map((r) => r.trim() as Region)
    } else if (arg === '--skip-download') {
      result.skipDownload = true
    } else if (arg === '--skip-upload') {
      result.skipUpload = true
    }
  }

  return result
}

/**
 * S3ベースのデータ収集メインエントリーポイント
 * 
 * フロー:
 * 1. S3から既存データをダウンロード
 * 2. Riot APIから新規マッチを取得（差分のみ）
 * 3. データをマージしてS3にアップロード
 */
export async function fetchRiotDataS3(): Promise<void> {
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

  console.log('🚀 Starting Riot API data fetch (S3 version)...')
  console.log(`📊 Regions: ${regions.join(', ')}`)
  console.log(`🎯 Max matches per region: ${maxMatches}`)
  
  if (args.skipDownload) {
    console.log('⚠️ Skipping S3 download (--skip-download flag)')
  }
  if (args.skipUpload) {
    console.log('⚠️ Skipping S3 upload (--skip-upload flag)')
  }

  await collectMatchesFromAllRegions(regions, tiers, maxMatches, args.skipDownload, args.skipUpload)

  console.log('\n✅ All data collection complete!')
}

// メイン実行
if (require.main === module) {
  fetchRiotDataS3().catch((error) => {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  })
}