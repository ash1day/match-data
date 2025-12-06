#!/usr/bin/env tsx
import * as dotenv from 'dotenv'

dotenv.config({ override: true })

import * as fs from 'node:fs'
import { createReadStream, createWriteStream } from 'node:fs'
import * as path from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'

/**
 * コマンドライン引数をパース
 */
function parseArgs(): { patch?: string; indexes?: boolean } {
  const args = process.argv.slice(2)
  const result: { patch?: string; indexes?: boolean } = {}

  for (const arg of args) {
    if (arg.startsWith('--patch=')) {
      result.patch = arg.split('=')[1]
    } else if (arg === '--indexes') {
      result.indexes = true
    }
  }

  return result
}

/**
 * ファイルパスが指定パッチまたはplayersファイルかどうか判定
 */
function isPatchOrPlayers(filePath: string, patch: string): boolean {
  // players.json.gz は常に同期
  if (filePath.endsWith('players.json.gz')) {
    return true
  }
  // 指定パッチのファイルのみ同期 (例: JP1/15.10/matches.parquet)
  return filePath.includes(`/${patch}/`)
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
  return (
    response.Contents?.map((item) => item.Key?.replace(PREFIX, '')).filter((key): key is string => Boolean(key)) || []
  )
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
        const { patch, indexes } = parseArgs()
        if (patch) {
          console.log(`📥 Downloading from S3 (patch: ${patch})...`)
          const files = await listFiles()
          const filteredFiles = files.filter((f) => isPatchOrPlayers(f, patch))
          console.log(`Found ${filteredFiles.length} files for patch ${patch} (${files.length} total in S3)`)

          for (const key of filteredFiles) {
            if (key.endsWith('.parquet') || key.endsWith('.json.gz')) {
              const localPath = path.join(process.cwd(), key)
              console.log(`  Downloading ${key}...`)
              await downloadFile(key, localPath)
            }
          }
        } else if (indexes) {
          // --indexes: players + インデックスのみ（重複チェック用）
          console.log('📥 Downloading players and indexes from S3...')
          const files = await listFiles()
          const targetFiles = files.filter(
            (f) => f.endsWith('players.json.gz') || f.endsWith('index.json.gz')
          )
          console.log(`Found ${targetFiles.length} files to download`)

          for (const key of targetFiles) {
            const localPath = path.join(process.cwd(), key)
            console.log(`  Downloading ${key}...`)
            await downloadFile(key, localPath)
          }
        } else {
          // パッチ指定なしの場合はplayersのみ
          console.log('📥 Downloading players from S3...')
          const files = await listFiles()
          const playerFiles = files.filter((f) => f.endsWith('players.json.gz'))
          console.log(`Found ${playerFiles.length} player files`)

          for (const key of playerFiles) {
            const localPath = path.join(process.cwd(), key)
            console.log(`  Downloading ${key}...`)
            await downloadFile(key, localPath)
          }
        }
        console.log('✅ Download complete')
        break
      }

      case 'upload': {
        const { patch } = parseArgs()
        if (!patch) {
          console.error('❌ Error: --patch=X.Y is required for upload')
          process.exit(1)
        }
        console.log(`📤 Uploading to S3 (patch: ${patch})...`)
        const localFiles = findLocalFiles(process.cwd(), /\.(parquet|json\.gz)$/)
        const filteredFiles = localFiles.filter((f) => isPatchOrPlayers(f, patch))
        console.log(`Found ${filteredFiles.length} files for patch ${patch} (${localFiles.length} total local)`)

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

      case 'cleanup': {
        const { patch } = parseArgs()
        if (!patch) {
          console.error('❌ Error: --patch=X.Y is required for cleanup (keeps only this patch)')
          process.exit(1)
        }
        console.log(`🗑️  Cleaning up S3 (keeping only patch: ${patch})...`)
        const s3Files = await listFiles()
        const filesToDelete = s3Files.filter((f) => !isPatchOrPlayers(f, patch))
        console.log(`Found ${filesToDelete.length} files to delete (keeping ${s3Files.length - filesToDelete.length})`)

        if (filesToDelete.length === 0) {
          console.log('✅ Nothing to delete')
          break
        }

        // Delete in batches of 1000 (S3 limit)
        const BATCH_SIZE = 1000
        for (let i = 0; i < filesToDelete.length; i += BATCH_SIZE) {
          const batch = filesToDelete.slice(i, i + BATCH_SIZE)
          const deleteCommand = new DeleteObjectsCommand({
            Bucket: BUCKET_NAME,
            Delete: {
              Objects: batch.map((key) => ({ Key: PREFIX + key }))
            }
          })
          await s3Client.send(deleteCommand)
          console.log(`  Deleted ${batch.length} files`)
        }
        console.log('✅ Cleanup complete')
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
  void main()
}
