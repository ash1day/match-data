#!/usr/bin/env tsx
import * as dotenv from 'dotenv'
dotenv.config({ override: true })
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand
} from '@aws-sdk/client-s3'
import * as fs from 'fs'
import * as path from 'path'
import { createReadStream, createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { versionMap, sortedVersionDateNums } from './constants/version-constants'

/**
 * 現在の最新パッチバージョンを取得
 */
function getLatestPatch(): string {
  const today = parseInt(
    new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '')
  )

  for (const dateNum of sortedVersionDateNums) {
    if (dateNum <= today) {
      return versionMap[dateNum]
    }
  }
  return versionMap[sortedVersionDateNums[0]]
}

/**
 * ファイルパスが最新パッチまたはplayersファイルかどうか判定
 */
function isLatestPatchOrPlayers(filePath: string, latestPatch: string): boolean {
  // players.json.gz は常に同期
  if (filePath.endsWith('players.json.gz')) {
    return true
  }
  // 最新パッチのファイルのみ同期 (例: JP1/15.10/matches.parquet)
  return filePath.includes(`/${latestPatch}/`)
}

const BUCKET_NAME = 'tftips'
const PREFIX = 'match-data/'
const REGION = 'ap-northeast-1'

// S3クライアント初期化
const s3Client = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  }
})

/**
 * S3からファイルをダウンロード
 */
async function downloadFile(key: string, localPath: string): Promise<void> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: PREFIX + key
  })

  const response = await s3Client.send(command)
  const dir = path.dirname(localPath)
  fs.mkdirSync(dir, { recursive: true })

  if (response.Body) {
    const stream = response.Body as Readable
    await pipeline(stream, createWriteStream(localPath))
  }
}

/**
 * S3にファイルをアップロード
 */
async function uploadFile(localPath: string, key: string): Promise<void> {
  const fileStream = createReadStream(localPath)
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: PREFIX + key,
    Body: fileStream
  })

  await s3Client.send(command)
}

/**
 * S3バケット内のファイル一覧を取得
 */
async function listFiles(subPrefix?: string): Promise<string[]> {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: PREFIX + (subPrefix || '')
  })

  const response = await s3Client.send(command)
  return response.Contents?.map((item) => item.Key!.replace(PREFIX, '')).filter(Boolean) || []
}

/**
 * ローカルのparquetファイルを探す
 */
function findLocalFiles(dir: string, pattern: RegExp): string[] {
  const files: string[] = []

  function traverse(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      const relativePath = path.relative(dir, fullPath)

      // node_modules、.git、match-dataディレクトリはスキップ
      if (
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        entry.name !== 'node_modules' &&
        entry.name !== 'match-data'
      ) {
        traverse(fullPath)
      } else if (entry.isFile() && pattern.test(entry.name)) {
        files.push(relativePath)
      }
    }
  }

  traverse(dir)
  return files
}

/**
 * メインコマンド処理
 */
async function main() {
  const command = process.argv[2] || 'download'

  try {
    switch (command) {
      case 'download': {
        const latestPatch = getLatestPatch()
        console.log(`📥 Downloading from S3 (patch: ${latestPatch})...`)
        const files = await listFiles()
        const filteredFiles = files.filter((f) => isLatestPatchOrPlayers(f, latestPatch))
        console.log(`Found ${filteredFiles.length} files for latest patch (${files.length} total in S3)`)

        for (const key of filteredFiles) {
          if (key.endsWith('.parquet') || key.endsWith('.json.gz')) {
            const localPath = path.join(process.cwd(), key)
            console.log(`  Downloading ${key}...`)
            await downloadFile(key, localPath)
          }
        }
        console.log('✅ Download complete')
        break
      }

      case 'upload': {
        const latestPatch = getLatestPatch()
        console.log(`📤 Uploading to S3 (patch: ${latestPatch})...`)
        const localFiles = findLocalFiles(process.cwd(), /\.(parquet|json\.gz)$/)
        const filteredFiles = localFiles.filter((f) => isLatestPatchOrPlayers(f, latestPatch))
        console.log(`Found ${filteredFiles.length} files for latest patch (${localFiles.length} total local)`)

        for (const file of filteredFiles) {
          const localPath = path.join(process.cwd(), file)
          console.log(`  Uploading ${file}...`)
          await uploadFile(localPath, file)
        }
        console.log('✅ Upload complete')
        break
      }

      case 'status': {
        console.log('📊 S3 Status')
        console.log('============')

        const s3Files = await listFiles()
        const localFiles = findLocalFiles(process.cwd(), /\.(parquet|json\.gz)$/)

        console.log(`S3 files: ${s3Files.length}`)
        console.log(`Local files: ${localFiles.length}`)

        console.log('\nRecent S3 files:')
        s3Files.slice(-10).forEach((f) => console.log(`  - ${f}`))

        console.log('\nRecent local files:')
        localFiles.slice(-10).forEach((f) => console.log(`  - ${f}`))
        break
      }

      default:
        console.error(`Unknown command: ${command}`)
        console.log('Usage: tsx sync-s3.ts [download|upload|status]')
        process.exit(1)
    }
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}
