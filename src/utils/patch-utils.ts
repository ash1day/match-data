/**
 * ゲームバージョンからパッチディレクトリ名を生成
 *
 * 例:
 * - "15.15.701.6241" → "15.15"
 * - "Linux Version 15.14.697.2104 ..." → "15.14"
 *
 * メジャー.マイナーバージョンでディレクトリを作成
 * （ビルド番号は切り捨て）
 */

const GAME_VERSION_PATTERN = /(?:Version )?(\d+)\.(\d+)\.(\d+)\.(\d+)/

export function gameVersionToPatchDir(gameVersion: string): string {
  const match = gameVersion.match(GAME_VERSION_PATTERN)
  if (!match) {
    throw new Error(`Invalid game version format: ${gameVersion}`)
  }

  const [, major, minor] = match

  // メジャー.マイナー形式
  // 例: 15.14, 15.15
  return `${major}.${minor}`
}

/**
 * パッチ番号を比較用の数値に変換
 * "15.14" → 1514
 * "15.15" → 1515
 */
export function patchToNumber(patch: string): number {
  const [major, minor] = patch.split('.')
  return Number.parseInt(major) * 100 + Number.parseInt(minor)
}
