// Git-based match data storage (S3の代替)
import { execSync } from 'child_process'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import type { MatchTFTDTO } from 'twisted/dist/models-dto'
import { gzipSync, gunzipSync } from 'zlib'
import { Database } from 'duckdb-async'

// データリポジトリのパス（現在のディレクトリ）
const DATA_REPO_PATH = process.cwd()

/**
 * Git リポジトリの初期化（既にリポジトリ内にいるため、pullのみ）
 */
export async function initDataRepo(): Promise<void> {
  // 最新を取得
  try {
    execSync('git pull origin main', { cwd: DATA_REPO_PATH })
  } catch (error) {
    console.log('Warning: Could not pull latest changes:', (error as Error).message)
  }
}

/**
 * マッチデータのファイルパスを生成
 */
function getMatchDataPath(patch: string, region: string): string {
  return join(DATA_REPO_PATH, region.toUpperCase(), patch, 'matches.parquet')
}

/**
 * プレイヤーデータのファイルパスを生成
 */
function getPlayerDataPath(region: string): string {
  return join(DATA_REPO_PATH, region.toUpperCase(), 'players.json.gz')
}

/**
 * マッチIDインデックスのファイルパスを生成
 */
function getMatchIndexPath(patch: string, region: string): string {
  return join(DATA_REPO_PATH, region.toUpperCase(), patch, 'index.json.gz')
}

/**
 * マッチデータを保存（Git操作なし）
 */
export async function saveMatchData(matches: MatchTFTDTO[], patch: string, region: string): Promise<void> {
  const filePath = getMatchDataPath(patch, region)
  const dir = dirname(filePath)

  // ディレクトリ作成
  mkdirSync(dir, { recursive: true })

  const db = await Database.create(':memory:')
  try {
    // 既存のデータがある場合は読み込む
    let existingMatchIds = new Set<string>()
    if (existsSync(filePath)) {
      const existingData = await db.all(`
        SELECT metadata->>'match_id' as match_id FROM read_parquet('${filePath}')
      `)
      existingMatchIds = new Set(existingData.map((row) => row.match_id))
      console.log(`  Found ${existingMatchIds.size} existing matches in ${filePath}`)
    }

    // 新規マッチのみをフィルタリング
    const newMatches = matches.filter((match) => !existingMatchIds.has(match.metadata.match_id))

    if (newMatches.length === 0) {
      console.log(`  No new matches to save for ${patch}-${region}`)
      return
    }

    // 一時的にJSONファイルを作成
    const tempJsonPath = filePath.replace('.parquet', '.temp.json')
    writeFileSync(tempJsonPath, JSON.stringify(newMatches))

    // DuckDBでJSONを読み込んでテーブルを作成
    await db.run(`CREATE TABLE new_matches AS SELECT * FROM read_json('${tempJsonPath}', format='array')`)

    if (existsSync(filePath)) {
      // 既存のParquetファイルに追加
      const tempParquetPath = filePath.replace('.parquet', '.temp.parquet')

      // 既存データと新規データを結合して新しいParquetファイルを作成
      await db.run(`
        COPY (
          SELECT * FROM read_parquet('${filePath}')
          UNION ALL
          SELECT * FROM new_matches
        ) TO '${tempParquetPath}' (FORMAT PARQUET, COMPRESSION 'SNAPPY')
      `)

      // 元のファイルを置き換え
      require('fs').renameSync(tempParquetPath, filePath)
    } else {
      // 新規ファイルとして保存
      await db.run(`
        COPY new_matches TO '${filePath}' (FORMAT PARQUET, COMPRESSION 'SNAPPY')
      `)
    }

    // 一時ファイルを削除
    if (existsSync(tempJsonPath)) {
      require('fs').unlinkSync(tempJsonPath)
    }

    console.log(
      `  Added ${newMatches.length} new matches to ${filePath} (total: ${existingMatchIds.size + newMatches.length})`
    )
  } finally {
    await db.close()
  }
}

/**
 * 全データを一括でGitにコミット・プッシュ
 */
export async function commitAndPushAllData(summary: string): Promise<void> {
  try {
    execSync('git add .', { cwd: DATA_REPO_PATH })

    const message = `Batch update: ${summary}

Generated at: ${new Date().toISOString()}`

    execSync(`git commit -m "${message}"`, { cwd: DATA_REPO_PATH })
    execSync('git push origin main', { cwd: DATA_REPO_PATH })

    console.log('✅ Pushed all data to Git repository')
  } catch (error: any) {
    if (error.message.includes('nothing to commit')) {
      console.log('No changes to commit')
    } else {
      throw error
    }
  }
}

/**
 * マッチデータを読み込み
 */
export async function loadMatchData(patch: string, region: string): Promise<MatchTFTDTO[]> {
  const filePath = getMatchDataPath(patch, region)

  if (!existsSync(filePath)) {
    console.log(`No data found for ${patch}-${region}`)
    return []
  }

  // DuckDBを使ってParquetファイルを読み込み
  const db = await Database.create(':memory:')
  try {
    const result = await db.all(`
      SELECT * FROM read_parquet('${filePath}')
    `)
    return result as MatchTFTDTO[]
  } finally {
    await db.close()
  }
}

/**
 * マッチIDインデックスを保存
 */
export async function saveMatchIndex(matchIds: string[], patch: string, region: string): Promise<void> {
  const filePath = getMatchIndexPath(patch, region)
  const dir = dirname(filePath)

  // ディレクトリ作成
  mkdirSync(dir, { recursive: true })

  // 既存のインデックスを読み込み
  const existingIds = await loadMatchIndex(patch, region)

  // 重複を除いてマージ
  const allIds = Array.from(new Set([...existingIds, ...matchIds]))

  // GZIP圧縮して保存
  const compressed = gzipSync(JSON.stringify(allIds), { level: 9 })
  writeFileSync(filePath, compressed)

  console.log(`Saved ${allIds.length} match IDs to index (${matchIds.length} new)`)
}

/**
 * マッチIDインデックスを読み込み
 */
export async function loadMatchIndex(patch: string, region: string): Promise<string[]> {
  const filePath = getMatchIndexPath(patch, region)

  if (!existsSync(filePath)) {
    return []
  }

  const compressed = readFileSync(filePath)
  const decompressed = gunzipSync(compressed)
  return JSON.parse(decompressed.toString())
}

/**
 * 新しいマッチIDのみをフィルタリング
 */
export async function filterNewMatchIds(matchIds: string[], patch: string, region: string): Promise<string[]> {
  const existingIds = await loadMatchIndex(patch, region)
  const existingSet = new Set(existingIds)

  const newIds = matchIds.filter((id) => !existingSet.has(id))
  console.log(`Filtered ${newIds.length} new match IDs out of ${matchIds.length} total`)

  return newIds
}

/**
 * 利用可能なパッチ一覧を取得
 */
export async function getAvailablePatches(): Promise<string[]> {
  if (!existsSync(DATA_REPO_PATH)) {
    return []
  }

  // すべてのリージョンディレクトリを検索
  const regions = execSync('ls -d */', {
    cwd: DATA_REPO_PATH,
    encoding: 'utf-8'
  })
    .trim()
    .split('\n')
    .map((dir) => dir.replace('/', ''))

  const patches = new Set<string>()

  for (const region of regions) {
    const regionDir = join(DATA_REPO_PATH, region)
    if (existsSync(regionDir)) {
      try {
        const patchDirs = execSync('ls -d */ 2>/dev/null || true', {
          cwd: regionDir,
          encoding: 'utf-8'
        })
          .trim()
          .split('\n')
          .filter((dir) => dir && dir !== 'players.json.gz')

        patchDirs.forEach((dir) => {
          const patchName = dir.replace('/', '')
          // パッチ番号の形式をチェック（例: 1513.00）
          if (/^\d+\.\d+$/.test(patchName)) {
            const matchFile = join(regionDir, patchName, 'matches.parquet')
            if (existsSync(matchFile)) {
              patches.add(patchName)
            }
          }
        })
      } catch (e) {
        // No patch directories in this region
      }
    }
  }

  return Array.from(patches).sort((a, b) => b.localeCompare(a))
}

/**
 * 最新パッチを取得
 */
export async function getLatestPatch(): Promise<string> {
  const patches = await getAvailablePatches()
  return patches[0] || '14.24'
}

/**
 * パッチの利用可能なリージョン一覧を取得
 */
export async function getAvailableRegions(patch: string): Promise<string[]> {
  if (!existsSync(DATA_REPO_PATH)) {
    return []
  }

  // すべてのリージョンディレクトリを検索
  const regions = execSync('ls -d */', {
    cwd: DATA_REPO_PATH,
    encoding: 'utf-8'
  })
    .trim()
    .split('\n')
    .map((dir) => dir.replace('/', ''))

  const availableRegions: string[] = []

  for (const region of regions) {
    const patchFile = join(DATA_REPO_PATH, region, patch, 'matches.parquet')
    if (existsSync(patchFile)) {
      availableRegions.push(region)
    }
  }

  return availableRegions
}

/**
 * リポジトリのサイズ情報を取得
 */
export async function getRepoStats(): Promise<{
  totalSize: string
  fileCount: number
  lastUpdate: string
}> {
  const totalSize = execSync('du -sh .', {
    cwd: DATA_REPO_PATH,
    encoding: 'utf-8'
  }).split('\t')[0]

  const fileCount = parseInt(
    execSync('find . -name "*.json.gz" -o -name "*.parquet" | wc -l', {
      cwd: DATA_REPO_PATH,
      encoding: 'utf-8'
    }).trim()
  )

  const lastUpdate = execSync('git log -1 --format=%cd', {
    cwd: DATA_REPO_PATH,
    encoding: 'utf-8'
  }).trim()

  return { totalSize, fileCount, lastUpdate }
}

/**
 * プレイヤーデータを保存（Git管理）
 */
export async function savePlayerData(players: any[], region: string): Promise<void> {
  const filePath = getPlayerDataPath(region)
  const dir = dirname(filePath)

  // ディレクトリ作成
  mkdirSync(dir, { recursive: true })

  // GZIP圧縮して保存
  const compressed = gzipSync(JSON.stringify(players), { level: 9 })
  writeFileSync(filePath, compressed)

  console.log(`Saved ${players.length} players to ${filePath}`)

  // Git操作
  try {
    execSync('git add .', { cwd: DATA_REPO_PATH })

    const message = `Update ${region} players

- Total players: ${players.length}
- File size: ${(compressed.length / 1024).toFixed(2)} KB`

    execSync(`git commit -m "${message}"`, { cwd: DATA_REPO_PATH })
    execSync('git push origin main', { cwd: DATA_REPO_PATH })

    console.log('Pushed to Git repository')
  } catch (error: any) {
    if (error.message.includes('nothing to commit')) {
      console.log('No changes to commit')
    } else {
      throw error
    }
  }
}

/**
 * プレイヤーデータを読み込み
 */
export async function loadPlayerData(region: string): Promise<any[]> {
  const filePath = getPlayerDataPath(region)

  if (!existsSync(filePath)) {
    console.log(`No player data found for ${region}`)
    return []
  }

  const compressed = readFileSync(filePath)
  const decompressed = gunzipSync(compressed)
  return JSON.parse(decompressed.toString())
}

/**
 * 利用可能なリージョン一覧を取得
 */
export async function getAvailableRegionsList(): Promise<string[]> {
  if (!existsSync(DATA_REPO_PATH)) {
    return []
  }

  try {
    const output = execSync('ls -d */', {
      cwd: DATA_REPO_PATH,
      encoding: 'utf-8'
    }).trim()

    if (!output) return []

    return output
      .split('\n')
      .map((dir) => dir.replace('/', ''))
      .filter((dir) => !dir.startsWith('.'))
  } catch (e) {
    return []
  }
}

// GitHub Actions用のGit設定
export function setupGitForCI(): void {
  execSync('git config --global user.email "actions@github.com"')
  execSync('git config --global user.name "GitHub Actions"')
}
