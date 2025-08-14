import 'dotenv/config'
import { createTftApi } from './src/utils/riot-api-utils'

async function testRawAPI() {
  const api = createTftApi()
  
  // Get a recent match
  const summoner = await api.Summoner.getByName('test', 'JP1')
  const matches = await api.Match.list(summoner.response.puuid, 'JP1', { count: 1 })
  
  if (matches.response.length === 0) {
    console.log('No matches found')
    return
  }
  
  const matchId = matches.response[0]
  console.log('Testing match:', matchId)
  
  const match = await api.Match.get(matchId, 'JP1')
  
  console.log('=== API Response Type Check ===')
  const participant = match.response.info.participants[0]
  
  console.log('\nParticipant fields:')
  console.log('  placement:', typeof participant.placement, '=', participant.placement)
  console.log('  level:', typeof participant.level, '=', participant.level)
  console.log('  gold_left:', typeof participant.gold_left, '=', participant.gold_left)
  console.log('  last_round:', typeof participant.last_round, '=', participant.last_round)
  console.log('  time_eliminated:', typeof participant.time_eliminated, '=', participant.time_eliminated)
  console.log('  total_damage_to_players:', typeof participant.total_damage_to_players, '=', participant.total_damage_to_players)
  
  if (participant.units && participant.units[0]) {
    console.log('\nUnit fields:')
    const unit = participant.units[0]
    console.log('  tier:', typeof unit.tier, '=', unit.tier)
    console.log('  rarity:', typeof unit.rarity, '=', unit.rarity)
  }
  
  if (participant.traits && participant.traits[0]) {
    console.log('\nTrait fields:')
    const trait = participant.traits[0]
    console.log('  tier_current:', typeof trait.tier_current, '=', trait.tier_current)
    console.log('  tier_total:', typeof trait.tier_total, '=', trait.tier_total)
    console.log('  num_units:', typeof trait.num_units, '=', trait.num_units)
  }
  
  console.log('\n=== Match metadata ===')
  console.log('  game_datetime:', typeof match.response.info.game_datetime, '=', match.response.info.game_datetime)
  console.log('  game_length:', typeof match.response.info.game_length, '=', match.response.info.game_length)
  
  // Check if any BigInt
  console.log('\n=== Checking for BigInt ===')
  const checkBigInt = (obj: any, path = ''): void => {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key
      if (typeof value === 'bigint') {
        console.log(`  BigInt found at ${currentPath}:`, value)
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        checkBigInt(value, currentPath)
      }
    }
  }
  
  checkBigInt(match.response)
}

testRawAPI().catch(console.error)