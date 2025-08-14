import { Database } from 'duckdb-async'
import * as fs from 'fs'
import * as path from 'path'

async function analyzeExistingData() {
  // Use the actual data we have
  const statDir = '/Users/ash1day/tn/stat'
  const parquetPath = path.join(statDir, 'tmp-match-data/JP1/15.16/matches.parquet')
  
  if (!fs.existsSync(parquetPath)) {
    console.error('Parquet file not found:', parquetPath)
    return
  }
  
  console.log('=== Analyzing existing Parquet data ===')
  
  const db = await Database.create(':memory:')
  await db.run(`INSTALL parquet; LOAD parquet;`)
  
  // Load the parquet file
  await db.run(`
    CREATE TABLE matches AS 
    SELECT * FROM read_parquet('${parquetPath}')
    LIMIT 1
  `)
  
  // Check the raw structure
  console.log('\n1. Checking raw data structure:')
  const columns = await db.all(`DESCRIBE matches`)
  console.log('Columns:', columns.map(c => `${c.column_name} (${c.column_type})`).join(', '))
  
  // Check participant data
  console.log('\n2. Checking participant data:')
  const participantCheck = await db.all(`
    SELECT 
      json_extract(p.unnest, '$.placement') as placement_raw,
      json_type(json_extract(p.unnest, '$.placement')) as placement_type,
      json_extract(p.unnest, '$.level') as level_raw,
      json_type(json_extract(p.unnest, '$.level')) as level_type
    FROM matches m,
    UNNEST(json_transform_strict(m.info.participants, '["JSON"]')) AS p
    LIMIT 1
  `)
  
  console.log('Participant data:')
  console.log('  placement:', participantCheck[0].placement_raw, 'type:', participantCheck[0].placement_type)
  console.log('  level:', participantCheck[0].level_raw, 'type:', participantCheck[0].level_type)
  
  // Check unit data
  console.log('\n3. Checking unit data:')
  const unitCheck = await db.all(`
    SELECT 
      json_extract(unit.unnest, '$.tier') as tier_raw,
      json_type(json_extract(unit.unnest, '$.tier')) as tier_type,
      json_extract(unit.unnest, '$.character_id') as character_id
    FROM matches m,
    UNNEST(json_transform_strict(m.info.participants, '["JSON"]')) AS p,
    UNNEST(json_transform_strict(json_extract(p.unnest, '$.units'), '["JSON"]')) AS unit
    LIMIT 1
  `)
  
  console.log('Unit data:')
  console.log('  tier:', unitCheck[0].tier_raw, 'type:', unitCheck[0].tier_type)
  console.log('  character_id:', unitCheck[0].character_id)
  
  // Try to understand the encoding
  console.log('\n4. Analyzing encoding levels:')
  const placement = participantCheck[0].placement_raw
  console.log('  Raw value:', placement)
  console.log('  Length:', placement.length)
  
  // Count escape levels
  let escapeCount = 0
  let testStr = placement
  while (testStr.includes('\\')) {
    escapeCount++
    testStr = testStr.replace(/\\/g, '')
  }
  console.log('  Escape levels:', escapeCount)
  
  // Try to decode
  let decoded = placement
  try {
    decoded = JSON.parse(decoded)
    console.log('  After 1st parse:', decoded, 'type:', typeof decoded)
    
    if (typeof decoded === 'string') {
      decoded = JSON.parse(decoded)
      console.log('  After 2nd parse:', decoded, 'type:', typeof decoded)
      
      if (typeof decoded === 'string') {
        decoded = JSON.parse(decoded)
        console.log('  After 3rd parse:', decoded, 'type:', typeof decoded)
        
        if (typeof decoded === 'string') {
          decoded = JSON.parse(decoded)
          console.log('  After 4th parse:', decoded, 'type:', typeof decoded)
        }
      }
    }
  } catch (e) {
    console.log('  Parse error:', e.message)
  }
  
  await db.close()
}

analyzeExistingData().catch(console.error)