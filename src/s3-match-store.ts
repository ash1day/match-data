import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as zlib from 'zlib'
import { Database } from 'duckdb-async'
import type { MatchTFTDTO } from 'twisted/dist/models-dto'

/**
 * S3ベースのマッチデータストア
 *
 * フロー:
 * 1. S3から既存データをダウンロード
 * 2. 既存のマッチIDを読み込み
 * 3. 新規マッチのみAPI取得
 * 4. データをマージしてS3にアップロード
 */

const DATA_DIR = process.cwd()

/**
 * S3から既存データをダウンロード
 */
export async function downloadFromS3(): Promise<void> {
  console.log('📥 Downloading existing data from S3...')
  try {
    execSync('tsx src/sync-s3.ts download', { stdio: 'inherit', cwd: DATA_DIR })
    console.log('✅ Download complete')
  } catch (error) {
    console.warn('⚠️ Failed to download from S3 (may be first run):', error)
  }
}

/**
 * S3にデータをアップロード
 */
export async function uploadToS3(): Promise<void> {
  console.log('📤 Uploading data to S3...')
  execSync('tsx src/sync-s3.ts upload', { stdio: 'inherit', cwd: DATA_DIR })
  console.log('✅ Upload complete')
}

/**
 * 既存のマッチIDを取得
 */
export async function getExistingMatchIds(region: string, patch: string): Promise<Set<string>> {
  const indexPath = path.join(DATA_DIR, region, patch, 'index.json.gz')

  if (!fs.existsSync(indexPath)) {
    console.log(`  No existing index for ${region}/${patch}`)
    return new Set()
  }

  const compressed = fs.readFileSync(indexPath)
  const decompressed = zlib.gunzipSync(compressed)
  const matchIds = JSON.parse(decompressed.toString()) as string[]

  console.log(`  Found ${matchIds.length} existing matches in ${region}/${patch}`)
  return new Set(matchIds)
}

/**
 * 新規マッチIDをフィルタリング
 */
export async function filterNewMatchIds(matchIds: string[], region: string, patch: string): Promise<string[]> {
  const existingIds = await getExistingMatchIds(region, patch)
  const newIds = matchIds.filter((id) => !existingIds.has(id))

  console.log(`  ${newIds.length} new matches to fetch (${existingIds.size} already exist)`)
  return newIds
}

/**
 * マッチデータを保存（Parquet形式）
 */
export async function saveMatchData(matches: MatchTFTDTO[], region: string, patch: string): Promise<void> {
  const dir = path.join(DATA_DIR, region, patch)
  fs.mkdirSync(dir, { recursive: true })

  const parquetPath = path.join(dir, 'matches.parquet')
  const tempParquetPath = path.join(dir, 'matches_new.parquet')

  // 既存データがある場合はマージ
  let existingMatches: MatchTFTDTO[] = []
  if (fs.existsSync(parquetPath)) {
    console.log(`  Loading existing matches from ${parquetPath}...`)
    const db = await Database.create(':memory:')
    await db.run(`INSTALL parquet; LOAD parquet;`)

    const result = await db.all(`SELECT * FROM parquet_scan('${parquetPath}')`)
    existingMatches = result as MatchTFTDTO[]
    console.log(`  Loaded ${existingMatches.length} existing matches`)
    await db.close()
  }

  // マッチIDでユニーク化
  const matchMap = new Map<string, MatchTFTDTO>()
  for (const match of existingMatches) {
    matchMap.set(match.metadata.match_id, match)
  }
  for (const match of matches) {
    matchMap.set(match.metadata.match_id, match)
  }

  const allMatches = Array.from(matchMap.values())
  console.log(`  Saving ${allMatches.length} total matches to ${tempParquetPath}`)

  // DuckDBでParquetファイルを作成
  const db = await Database.create(':memory:')
  await db.run(`INSTALL parquet; LOAD parquet;`)

  // JSONをテーブルに読み込み
  const jsonPath = path.join(dir, 'temp_matches.json')
  // BigIntを文字列に変換してからJSON化
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(allMatches, (key, value) => (typeof value === 'bigint' ? value.toString() : value))
  )

  // read_json with explicit JSON type to preserve structure
  await db.run(`
    CREATE TABLE matches AS 
    SELECT 
      metadata,
      info
    FROM read_json('${jsonPath}', 
      columns = {
        metadata: 'JSON',
        info: 'JSON'
      }
    )
  `)

  // Parquetとして保存
  await db.run(`COPY matches TO '${tempParquetPath}' (FORMAT PARQUET, COMPRESSION ZSTD)`)

  await db.close()

  // 一時ファイルを削除
  fs.unlinkSync(jsonPath)

  // 新しいファイルで置き換え
  if (fs.existsSync(parquetPath)) {
    fs.unlinkSync(parquetPath)
  }
  fs.renameSync(tempParquetPath, parquetPath)

  console.log(`  ✅ Saved ${allMatches.length} matches to ${parquetPath}`)
}

/**
 * マッチインデックスを保存
 */
export async function saveMatchIndex(matchIds: string[], region: string, patch: string): Promise<void> {
  const dir = path.join(DATA_DIR, region, patch)
  fs.mkdirSync(dir, { recursive: true })

  const indexPath = path.join(dir, 'index.json.gz')

  // 既存のインデックスを読み込み
  let existingIds: string[] = []
  if (fs.existsSync(indexPath)) {
    const compressed = fs.readFileSync(indexPath)
    const decompressed = zlib.gunzipSync(compressed)
    existingIds = JSON.parse(decompressed.toString()) as string[]
  }

  // マージしてユニーク化
  const allIds = Array.from(new Set([...existingIds, ...matchIds]))

  // 圧縮して保存
  const compressed = zlib.gzipSync(
    JSON.stringify(allIds, (key, value) => (typeof value === 'bigint' ? value.toString() : value))
  )
  fs.writeFileSync(indexPath, compressed)

  console.log(`  ✅ Saved ${allIds.length} match IDs to index`)
}

/**
 * データ収集プロセスの初期化
 */
export async function initDataStore(): Promise<void> {
  // S3から最新データをダウンロード
  await downloadFromS3()
}

/**
 * データ収集プロセスの完了
 */
export async function finalizeDataStore(): Promise<void> {
  // S3にアップロード
  await uploadToS3()
}

/**
 * プレイヤーデータを読み込み
 */
export async function loadPlayerData(region: string): Promise<any> {
  const filePath = path.join(DATA_DIR, region, 'players.json.gz')

  if (!fs.existsSync(filePath)) {
    return null
  }

  const compressed = fs.readFileSync(filePath)
  const decompressed = zlib.gunzipSync(compressed)
  return JSON.parse(decompressed.toString())
}

/**
 * プレイヤーデータを保存
 */
export async function savePlayerData(players: any[], region: string): Promise<void> {
  const dir = path.join(DATA_DIR, region)
  fs.mkdirSync(dir, { recursive: true })

  const filePath = path.join(dir, 'players.json.gz')
  const compressed = zlib.gzipSync(
    JSON.stringify(players, (key, value) => (typeof value === 'bigint' ? value.toString() : value))
  )
  fs.writeFileSync(filePath, compressed)

  console.log(`  ✅ Saved ${players.length} players to ${filePath}`)
}
