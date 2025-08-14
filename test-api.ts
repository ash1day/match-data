import 'dotenv/config'
import { createTftApi } from './src/utils/riot-api-utils'

async function testAPI() {
  const api = createTftApi()
  const match = await api.Match.get('JP1_517974628', 'JP1')
  
  console.log('=== Participant data type check ===')
  const participant = match.info.participants[0]
  console.log('placement type:', typeof participant.placement)
  console.log('placement value:', JSON.stringify(participant.placement))
  console.log('level type:', typeof participant.level)
  console.log('level value:', JSON.stringify(participant.level))
  
  if (participant.units && participant.units[0]) {
    console.log('\n=== Unit data type check ===')
    console.log('unit tier type:', typeof participant.units[0].tier)
    console.log('unit tier value:', JSON.stringify(participant.units[0].tier))
  }
  
  // Check raw JSON
  console.log('\n=== Raw JSON check ===')
  console.log('Raw participant (first 500 chars):', JSON.stringify(participant).substring(0, 500))
}

testAPI().catch(console.error)