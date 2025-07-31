import { TftApi } from 'twisted'
import { GenericError } from 'twisted/dist/errors'
import type { ApiResponseDTO } from 'twisted/dist/models-dto'

export const REQUEST_BUFFER_RATE = 0.9
export const MAX_RETRY_ATTEMPTS = 3

/**
 * TFT APIクライアントを作成する
 */
export function createTftApi(): TftApi {
  const apiKey = process.env.RIOT_API_KEY
  if (!apiKey) {
    throw new Error('RIOT_API_KEY is not set in environment variables')
  }
  return new TftApi({
    key: apiKey,
    rateLimitRetryAttempts: 3
  })
}

/**
 * 配列を指定サイズのスライスに分割して処理する
 */
async function eachSliceAsync<T>(array: T[], size: number, callback: (slice: T[]) => Promise<void>) {
  let n = 0
  while (n < array.length) {
    const slice = array.slice(n, n + size)
    await callback(slice)
    n += size
  }
}

/**
 * 指定時間スリープする
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * APIの利用制限を考慮して複数のリクエストを処理する
 */
export async function batchGetWithFlowRestriction<T, U extends unknown[]>(
  api: (key: string, ...otherArgs: U) => Promise<ApiResponseDTO<T>>,
  keys: Array<string>,
  otherArgs: U,
  rateLimitPerSecond: number,
  bufferRate: number
): Promise<Array<T>> {
  const sliceSize = Math.floor(rateLimitPerSecond * bufferRate)
  const result: Array<T> = []

  await eachSliceAsync(keys, sliceSize, async (slicedKeys) => {
    const slicedResult = await Promise.all(
      slicedKeys.map(async (key) => {
        try {
          return (await api(key, ...otherArgs)).response
        } catch (error) {
          // Error handling mainly for 404 error
          if (error instanceof GenericError) {
            console.log(`Failed API call: ${api.name}(${key}, ${otherArgs.join(', ')})`)
            console.error(`Error: ${error.message}, Status: ${error.status}`)
            return null
          } else {
            throw error
          }
        }
      })
    )
    const compactResult = slicedResult.filter((response) => response !== null) as Array<T>
    result.push(...compactResult)
    await sleep(1000) // 1秒に行えるだけのsliceSizeにしているので、1秒待つ
  })

  return result
}

/**
 * 単一のAPIリクエストを実行（リトライ付き）
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = MAX_RETRY_ATTEMPTS,
  delayMs = 1000
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      if (error instanceof GenericError) {
        // レート制限エラーの場合は長めに待機
        if (error.status === 429 || error.status === 420) {
          const waitTime = delayMs * Math.pow(2, attempt)
          console.log(`Rate limit hit, waiting ${waitTime}ms before retry...`)
          await new Promise((resolve) => setTimeout(resolve, waitTime))
          continue
        }

        // その他のAPIエラーはリトライしない
        throw error
      }

      // ネットワークエラーなどはリトライ
      if (attempt < maxRetries) {
        const waitTime = delayMs * Math.pow(2, attempt)
        console.log(`Request failed, retrying in ${waitTime}ms...`)
        await new Promise((resolve) => setTimeout(resolve, waitTime))
      }
    }
  }

  throw lastError || new Error('Maximum retry attempts reached')
}
