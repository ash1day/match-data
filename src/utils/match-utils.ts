// Updated pattern to handle both formats:
// 1. "Linux Version 14.11.589.9418 (May 30 2024/09:53:23) [PUBLIC]"
// 2. "14.11.589.9418"
const GAME_VERSION_PATTERN = /(?:Version )?(\d+)\.(\d+)\.(\d+)\.(\d+)/

// e.g. "Linux Version 14.11.589.9418 (May 30 2024/09:53:23) [PUBLIC]" => 141100
// e.g. "14.11.589.9418" => 141100
export const formatGameVersionToPatch = (gameVersion: string): number => {
  const match = gameVersion.match(GAME_VERSION_PATTERN)
  if (match) {
    const major = match[1].padStart(2, '0')
    const minor = match[2].padStart(2, '0')
    return Number(`${major}${minor}`) * 100
  }
  return Number.NaN
}
