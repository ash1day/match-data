import type { TftApi } from 'twisted'
import { createTftApi } from '../utils/riot-api-utils'
import { Players } from './players'
import type { Region, Tier } from './types'

/**
 * データ収集の基底クラス
 * プレイヤー情報とマッチデータの収集で共通の処理を提供
 */
export abstract class BaseCollector {
  protected api: TftApi
  protected players: Players

  constructor() {
    this.api = createTftApi()
    this.players = new Players()
  }

  /**
   * 全リージョンからデータを収集
   */
  async collectFromAllRegions(regions: Region[], tiers: Tier[], ...additionalParams: unknown[]): Promise<void> {
    this._logCollectionStart(regions, tiers)

    let totalCollected = 0

    for (const region of regions) {
      try {
        const collected = await this._collectFromRegion(region, tiers, ...(additionalParams as []))
        totalCollected += collected
      } catch (error) {
        console.error(`Error processing ${region}:`, error)
      }
    }

    this._logCollectionSummary(totalCollected)

    // メモリキャッシュをクリア
    this.players.clearMemoryCache()
  }

  /**
   * 収集開始時のログ出力
   */
  protected _logCollectionStart(regions: Region[], tiers: Tier[]): void {
    console.log(`=== ${this._getCollectionName()} ===`)
    console.log(`Regions: ${regions.join(', ')}`)
    console.log(`Tiers: ${tiers.join(', ')}`)
  }

  /**
   * 収集完了時のサマリーログ出力
   */
  protected _logCollectionSummary(totalCollected: number): void {
    console.log(`\n=== Collection Summary ===`)
    console.log(`Total ${this._getItemName()} collected: ${totalCollected}`)
    console.log('\n=== Complete ===')
  }

  /**
   * リージョンごとの収集処理（サブクラスで実装）
   * @returns 収集したアイテム数
   */
  protected abstract _collectFromRegion(region: Region, tiers: Tier[], ...additionalParams: unknown[]): Promise<number>

  /**
   * 収集処理の名前（ログ用）
   */
  protected abstract _getCollectionName(): string

  /**
   * 収集するアイテムの名前（ログ用）
   */
  protected abstract _getItemName(): string
}
