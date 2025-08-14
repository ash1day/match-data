import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'
import { Database } from 'duckdb-async'
import { TftApi } from 'twisted'

// Load .env file explicitly
const envPath = path.resolve(__dirname, '.env')
const result = dotenv.config({ path: envPath })

if (result.error) {
  console.error('Error loading .env file:', result.error)
  process.exit(1)
}

// Clean up API key (remove any trailing characters)
if (process.env.RIOT_API_KEY) {
  // Remove 'export' if it exists at the end
  let cleanKey = process.env.RIOT_API_KEY.trim()
  if (cleanKey.endsWith('export')) {
    cleanKey = cleanKey.slice(0, -6).trim()
    console.log('Removed "export" from API key')
  }
  process.env.RIOT_API_KEY = cleanKey
}

async function debugCollect() {
  // Verify API key is loaded correctly
  const apiKey = process.env.RIOT_API_KEY
  if (!apiKey) {
    throw new Error('RIOT_API_KEY not found in environment')
  }
  
  console.log('API Key length:', apiKey.length)
  console.log('API Key preview:', apiKey.substring(0, 20) + '...')
  console.log('API Key ends with:', '...' + apiKey.substring(apiKey.length - 10))
  
  // Create API client directly
  const api = new TftApi({
    key: apiKey,
    rateLimitRetryAttempts: 3
  })
  
  console.log('=== Step 1: Fetching from Riot API ===')
  
  // Get matches from a player
  const puuids = [
    'kOrGdj0A6k0_iKOE5cYT0XpKU1OySqNhb4uA3l7wxu2YvBT4VYQlJY8OVcxCE0H0UAmJ3d_bBHJOlw'
  ]
  
  const matchListResponse = await api.Match.list(puuids[0], 'JP1', { count: 1, startTime: Math.floor(Date.now() / 1000) - 86400 * 7 })
  console.log('Match IDs:', matchListResponse)
  
  if (matchListResponse.length === 0) {
    console.log('No recent matches found')
    return
  }
  
  const matchId = matchListResponse[0]
  console.log('Fetching match:', matchId)
  
  const matchResponse = await api.Match.get(matchId, 'JP1')
  
  console.log('\n=== Step 2: Check raw API response ===')
  const participant = matchResponse.info.participants[0]
  console.log('Participant placement type:', typeof participant.placement, '=', participant.placement)
  console.log('Participant level type:', typeof participant.level, '=', participant.level)
  if (participant.units && participant.units[0]) {
    console.log('Unit tier type:', typeof participant.units[0].tier, '=', participant.units[0].tier)
  }
  
  // Simulate the save process
  const matches = [matchResponse]
  const dir = './debug-output'
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  
  console.log('\n=== Step 3: JSON.stringify ===')
  const jsonPath = path.join(dir, 'debug_matches.json')
  const jsonString = JSON.stringify(matches, (key, value) => {
    if (typeof value === 'bigint') {
      console.log(`  Found BigInt at key "${key}":`, value)
      return value.toString()
    }
    return value
  })
  fs.writeFileSync(jsonPath, jsonString)
  
  // Check the JSON
  const parsed = JSON.parse(jsonString)
  const p2 = parsed[0].info.participants[0]
  console.log('After JSON.stringify + parse:')
  console.log('  placement:', typeof p2.placement, '=', p2.placement)
  console.log('  level:', typeof p2.level, '=', p2.level)
  
  console.log('\n=== Step 4: DuckDB processing ===')
  const db = await Database.create(':memory:')
  await db.run(`INSTALL parquet; LOAD parquet;`)
  
  // Test read_json_auto
  await db.run(`
    CREATE TABLE matches AS 
    SELECT * FROM read_json_auto('${jsonPath}')
  `)
  
  const result = await db.all(`
    SELECT 
      json_extract(p.unnest, '$.placement') as placement_raw,
      json_type(json_extract(p.unnest, '$.placement')) as placement_type,
      json_extract(p.unnest, '$.level') as level_raw,
      json_type(json_extract(p.unnest, '$.level')) as level_type
    FROM matches m,
    UNNEST(json_transform_strict(m.info.participants, '["JSON"]')) AS p
    LIMIT 1
  `)
  
  console.log('DuckDB result:')
  console.log('  placement:', result[0].placement_raw, 'type:', result[0].placement_type)
  console.log('  level:', result[0].level_raw, 'type:', result[0].level_type)
  
  // Save as Parquet
  const parquetPath = path.join(dir, 'debug_matches.parquet')
  await db.run(`COPY matches TO '${parquetPath}' (FORMAT PARQUET, COMPRESSION ZSTD)`)
  
  console.log('\n=== Step 5: Read back from Parquet ===')
  await db.run(`
    CREATE TABLE test_read AS 
    SELECT * FROM read_parquet('${parquetPath}')
  `)
  
  const result2 = await db.all(`
    SELECT 
      json_extract(p.unnest, '$.placement') as placement_raw,
      json_type(json_extract(p.unnest, '$.placement')) as placement_type
    FROM test_read m,
    UNNEST(json_transform_strict(m.info.participants, '["JSON"]')) AS p
    LIMIT 1
  `)
  
  console.log('Read back from Parquet:')
  console.log('  placement:', result2[0].placement_raw, 'type:', result2[0].placement_type)
  
  await db.close()
  
  // Cleanup
  // fs.rmSync(dir, { recursive: true, force: true })
  console.log('\nDebug files saved in:', dir)
}

debugCollect().catch(console.error)