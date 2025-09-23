#!/usr/bin/env tsx
import * as dotenv from 'dotenv'
dotenv.config({ override: true })
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'

const BUCKET_NAME = 'tftips'
const PREFIX = 'match-data/'
const REGION = 'ap-northeast-1'

// NOTE: このスクリプトは特定のパッチをクリーンアップするためのものです
// 必要に応じてTARGET_PATCHを変更してください
const TARGET_PATCH = process.env.TARGET_PATCH || '15.16'

// S3クライアント初期化
const s3Client = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  }
})

/**
 * S3のファイル一覧を取得
 */
async function listFiles(): Promise<string[]> {
  const files: string[] = []
  let continuationToken: string | undefined

  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: PREFIX,
      ContinuationToken: continuationToken
    })

    const response = await s3Client.send(command)

    if (response.Contents) {
      for (const object of response.Contents) {
        if (object.Key) {
          // prefixを除去
          const key = object.Key.replace(PREFIX, '')
          files.push(key)
        }
      }
    }

    continuationToken = response.NextContinuationToken
  } while (continuationToken)

  return files
}

/**
 * S3からファイルを削除
 */
async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: PREFIX + key
  })
  await s3Client.send(command)
}

/**
 * ファイルパスが対象パッチのものかチェック
 */
function isTargetPatchFile(filePath: string, targetPatch: string): boolean {
  // players.json.gz は常に含める
  if (filePath.includes('players.json.gz')) {
    return true
  }

  // パスを分割
  const parts = filePath.split('/')

  // 最低2階層必要 (例: JP1/15.16)
  if (parts.length < 2) {
    return false
  }

  // 2番目の部分がパッチディレクトリ
  const patchDir = parts[1]

  // 完全一致で比較
  return patchDir === targetPatch
}

/**
 * 指定パッチ以外のファイルを削除
 */
async function cleanupS3() {
  console.log('🧹 Starting S3 cleanup...')
  console.log(`📋 Target patch: ${TARGET_PATCH}`)

  const files = await listFiles()
  console.log(`Found ${files.length} total files in S3`)

  // 削除対象のファイルを特定
  const filesToDelete = files.filter((file) => !isTargetPatchFile(file, TARGET_PATCH))
  const filesToKeep = files.filter((file) => isTargetPatchFile(file, TARGET_PATCH))

  console.log(`Files to keep: ${filesToKeep.length}`)
  console.log(`Files to delete: ${filesToDelete.length}`)

  if (filesToDelete.length === 0) {
    console.log('✅ No files to delete')
    return
  }

  // 削除対象を表示
  console.log('\n📝 Files to delete:')
  filesToDelete.slice(0, 20).forEach((f) => console.log(`  - ${f}`))
  if (filesToDelete.length > 20) {
    console.log(`  ... and ${filesToDelete.length - 20} more`)
  }

  // 削除確認
  console.log('\n⚠️ This will permanently delete these files from S3!')
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...')
  await new Promise((resolve) => setTimeout(resolve, 5000))

  // 削除実行
  console.log('\n🗑️ Deleting files...')
  for (const file of filesToDelete) {
    console.log(`  Deleting ${file}...`)
    await deleteFile(file)
  }

  console.log(`\n✅ Deleted ${filesToDelete.length} files`)
  console.log(`📊 Remaining files: ${filesToKeep.length}`)
}

// メイン実行
if (require.main === module) {
  cleanupS3().catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
}

export { cleanupS3 }
