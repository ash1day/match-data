import 'dotenv/config'
import axios from 'axios'

async function testDirectAPI() {
  const apiKey = process.env.RIOT_API_KEY
  if (!apiKey) {
    throw new Error('RIOT_API_KEY not set')
  }
  
  // Use a known match ID from our data
  const matchId = 'JP1_518420836'
  
  console.log('Testing direct API call for match:', matchId)
  
  try {
    const response = await axios.get(
      `https://jp1.api.riotgames.com/tft/match/v1/matches/${matchId}`,
      {
        headers: {
          'X-Riot-Token': apiKey
        }
      }
    )
    
    const match = response.data
    
    console.log('=== Raw API Response Type Check ===')
    const participant = match.info.participants[0]
    
    console.log('\nParticipant fields:')
    console.log('  placement:', typeof participant.placement, '=', JSON.stringify(participant.placement))
    console.log('  level:', typeof participant.level, '=', JSON.stringify(participant.level))
    console.log('  gold_left:', typeof participant.gold_left, '=', JSON.stringify(participant.gold_left))
    console.log('  last_round:', typeof participant.last_round, '=', JSON.stringify(participant.last_round))
    console.log('  time_eliminated:', typeof participant.time_eliminated, '=', JSON.stringify(participant.time_eliminated))
    console.log('  total_damage_to_players:', typeof participant.total_damage_to_players, '=', JSON.stringify(participant.total_damage_to_players))
    
    if (participant.units && participant.units[0]) {
      console.log('\nUnit fields:')
      const unit = participant.units[0]
      console.log('  tier:', typeof unit.tier, '=', JSON.stringify(unit.tier))
      console.log('  rarity:', typeof unit.rarity, '=', JSON.stringify(unit.rarity))
    }
    
    if (participant.traits && participant.traits[0]) {
      console.log('\nTrait fields:')
      const trait = participant.traits[0]
      console.log('  tier_current:', typeof trait.tier_current, '=', JSON.stringify(trait.tier_current))
      console.log('  tier_total:', typeof trait.tier_total, '=', JSON.stringify(trait.tier_total))
      console.log('  num_units:', typeof trait.num_units, '=', JSON.stringify(trait.num_units))
    }
    
    console.log('\n=== Match metadata ===')
    console.log('  game_datetime:', typeof match.info.game_datetime, '=', JSON.stringify(match.info.game_datetime))
    console.log('  game_length:', typeof match.info.game_length, '=', JSON.stringify(match.info.game_length))
    
    // Check raw JSON
    console.log('\n=== Raw JSON sample ===')
    console.log(JSON.stringify(participant, null, 2).substring(0, 500))
    
  } catch (error: any) {
    console.error('API Error:', error.response?.status, error.response?.data)
  }
}

testDirectAPI().catch(console.error)