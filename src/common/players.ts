import { loadPlayerData, savePlayerData, initDataStore } from '../s3-match-store'

export interface PlayerInfo {
  summonerId: string
  summonerName: string
  puuid: string
  riotTag: string
  tier: string
  division?: string
  leaguePoints?: number
}

interface PlayersData {
  players: Record<string, PlayerInfo> // summonerId -> PlayerInfo
  puuidIndex: Record<string, string> // puuid -> summonerId
  lastUpdated: string
}

export class Players {
  private cache: Map<string, PlayersData> = new Map() // region -> cache

  constructor() {
    // S3版では初期化時にダウンロードしない（別途initDataStoreで行う）
  }

  async loadPlayers(region: string): Promise<PlayersData> {
    // メモリキャッシュから返す
    if (this.cache.has(region)) {
      return this.cache.get(region)!
    }

    try {
      // Gitリポジトリから読み込み
      const playerArray = await loadPlayerData(region)

      if (playerArray.length === 0) {
        const emptyCache: PlayersData = {
          players: {},
          puuidIndex: {},
          lastUpdated: new Date().toISOString()
        }
        this.cache.set(region, emptyCache)
        return emptyCache
      }

      // 配列形式から既存の形式に変換
      const players: Record<string, PlayerInfo> = {}
      const puuidIndex: Record<string, string> = {}

      playerArray.forEach((player: PlayerInfo) => {
        players[player.summonerId] = player
        puuidIndex[player.puuid] = player.summonerId
      })

      const playersData: PlayersData = {
        players,
        puuidIndex,
        lastUpdated: new Date().toISOString()
      }

      this.cache.set(region, playersData)
      return playersData
    } catch (error) {
      console.error(`Failed to load players for ${region}:`, error)
      const emptyCache: PlayersData = {
        players: {},
        puuidIndex: {},
        lastUpdated: new Date().toISOString()
      }
      this.cache.set(region, emptyCache)
      return emptyCache
    }
  }

  async savePlayers(region: string, playersData?: PlayersData): Promise<void> {
    // playersDataが渡されない場合は、キャッシュから取得
    const dataToSave = playersData || this.cache.get(region)

    if (!dataToSave) {
      console.error(`No data to save for region ${region}`)
      return
    }

    // Gitリポジトリ初期化
    await initDataRepo()

    // オブジェクト形式から配列形式に変換
    const playerArray = Object.values(dataToSave.players)

    // Gitリポジトリに保存
    await savePlayerData(playerArray, region)

    // キャッシュ更新
    this.cache.set(region, dataToSave)
  }

  async addPlayer(region: string, player: PlayerInfo): Promise<void> {
    const data = await this.loadPlayers(region)
    data.players[player.summonerId] = player
    data.puuidIndex[player.puuid] = player.summonerId
    data.lastUpdated = new Date().toISOString()
    await this.savePlayers(region, data)
  }

  async getPlayerByPuuid(region: string, puuid: string): Promise<PlayerInfo | null> {
    const data = await this.loadPlayers(region)
    const summonerId = data.puuidIndex[puuid]
    return summonerId ? data.players[summonerId] : null
  }

  async getPlayerBySummonerId(region: string, summonerId: string): Promise<PlayerInfo | null> {
    const data = await this.loadPlayers(region)
    return data.players[summonerId] || null
  }

  async getAllPlayers(region: string): Promise<PlayerInfo[]> {
    const data = await this.loadPlayers(region)
    return Object.values(data.players)
  }

  clearMemoryCache(): void {
    this.cache.clear()
  }

  async removeDuplicates(region: string): Promise<number> {
    const data = await this.loadPlayers(region)
    const uniqueByPuuid = new Map<string, PlayerInfo>()

    Object.values(data.players).forEach((player) => {
      uniqueByPuuid.set(player.puuid, player)
    })

    const removedCount = Object.keys(data.players).length - uniqueByPuuid.size

    if (removedCount > 0) {
      data.players = {}
      data.puuidIndex = {}

      uniqueByPuuid.forEach((player) => {
        data.players[player.summonerId] = player
        data.puuidIndex[player.puuid] = player.summonerId
      })

      data.lastUpdated = new Date().toISOString()
      await this.savePlayers(region, data)
    }

    return removedCount
  }

  async getMissingPlayers(summonerIds: string[], region: string): Promise<string[]> {
    const data = await this.loadPlayers(region)
    return summonerIds.filter((id) => !data.players[id])
  }

  async upsertPlayers(players: PlayerInfo[], region: string): Promise<void> {
    const data = await this.loadPlayers(region)

    players.forEach((player) => {
      data.players[player.summonerId] = player
      data.puuidIndex[player.puuid] = player.summonerId
    })

    data.lastUpdated = new Date().toISOString()
    this.cache.set(region, data)
  }

  getPlayerCount(region: string): number {
    const data = this.cache.get(region)
    return data ? Object.keys(data.players).length : 0
  }
}
