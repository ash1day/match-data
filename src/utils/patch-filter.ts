import * as fs from 'fs'
import * as path from 'path'

export interface PatchConfig {
  targetPatch: string
  collectOnlyLatest: boolean
}

/**
 * パッチ設定を読み込み
 */
export function loadPatchConfig(): PatchConfig {
  const configPath = path.join(__dirname, '../../patch-config.json')
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return config
  } catch (error) {
    console.warn('⚠️ Failed to load patch-config.json, using defaults')
    return { targetPatch: '15.16', collectOnlyLatest: true }
  }
}

/**
 * ファイルパスが対象パッチのものかチェック
 * @param filePath ファイルパス (例: "JP1/15.16/matches.parquet", "JP1/players.json.gz")
 * @param targetPatch 対象パッチ (例: "15.16")
 * @returns 対象パッチのファイルならtrue
 */
export function isTargetPatchFile(filePath: string, targetPatch: string): boolean {
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

  // 完全一致で比較（15.16 === 15.16）
  return patchDir === targetPatch
}

/**
 * ファイルリストをフィルタリング
 * @param files ファイルパスの配列
 * @param config パッチ設定
 * @returns フィルタリングされたファイル配列
 */
export function filterFilesByPatch(files: string[], config: PatchConfig): string[] {
  if (!config.collectOnlyLatest || !config.targetPatch) {
    return files
  }

  return files.filter((file) => isTargetPatchFile(file, config.targetPatch))
}
