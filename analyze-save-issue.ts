import 'dotenv/config'
import { Database } from 'duckdb-async'
import * as fs from 'fs'
import * as path from 'path'

// Simulate the save process to understand the issue
async function analyzeSaveIssue() {
  // Create test data that mimics API response
  const testMatch = {
    metadata: {
      match_id: 'TEST_123',
      data_version: '5'
    },
    info: {
      game_datetime: 1734567890123,
      game_length: 1234.5,
      game_version: 'Version 15.16.571.9876 (Aug 13 2025)',
      participants: [
        {
          placement: 1,  // number
          level: 8,      // number
          gold_left: 50, // number
          last_round: 30,
          time_eliminated: 1234.5,
          total_damage_to_players: 150,
          puuid: 'test-puuid-123',
          units: [
            {
              character_id: 'TFT11_Irelia',
              tier: 2,  // number
              rarity: 3,
              itemNames: ['TFT_Item_GuinsoosRageblade']
            }
          ],
          traits: [
            {
              name: 'Set11_Porcelain',
              tier_current: 1,  // number
              tier_total: 3,
              num_units: 2
            }
          ]
        }
      ]
    }
  }
  
  console.log('=== Original data types ===')
  const p = testMatch.info.participants[0]
  console.log('placement type:', typeof p.placement, '=', p.placement)
  console.log('level type:', typeof p.level, '=', p.level)
  console.log('unit tier type:', typeof p.units[0].tier, '=', p.units[0].tier)
  
  // Simulate the current save process
  const dir = './test-output'
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  
  // Step 1: JSON.stringify with BigInt handler
  const jsonPath = path.join(dir, 'test_matches.json')
  const jsonString = JSON.stringify([testMatch], (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  )
  fs.writeFileSync(jsonPath, jsonString)
  
  console.log('\n=== After JSON.stringify ===')
  console.log('Sample JSON (first 500 chars):', jsonString.substring(0, 500))
  
  // Step 2: Read back and check
  const readBack = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
  const p2 = readBack[0].info.participants[0]
  console.log('\nAfter parse:')
  console.log('placement type:', typeof p2.placement, '=', p2.placement)
  console.log('level type:', typeof p2.level, '=', p2.level)
  console.log('unit tier type:', typeof p2.units[0].tier, '=', p2.units[0].tier)
  
  // Step 3: DuckDB processing
  const db = await Database.create(':memory:')
  await db.run(`INSTALL parquet; LOAD parquet;`)
  
  // Try different approaches
  console.log('\n=== Testing DuckDB read_json_auto ===')
  
  // Current approach
  await db.run(`
    CREATE TABLE test_auto AS 
    SELECT * FROM read_json_auto('${jsonPath}')
  `)
  
  const result1 = await db.all(`
    SELECT 
      json_extract(p.unnest, '$.placement') as placement_extracted,
      json_type(json_extract(p.unnest, '$.placement')) as placement_type
    FROM test_auto m,
    UNNEST(json_transform_strict(m.info.participants, '["JSON"]')) AS p
    LIMIT 1
  `)
  
  console.log('Result from read_json_auto:')
  console.log('  Placement:', result1[0].placement_extracted, 'Type:', result1[0].placement_type)
  
  // Alternative: Direct JSON columns
  await db.run(`
    CREATE TABLE test_direct AS 
    SELECT * FROM read_json('${jsonPath}', 
      columns = {
        metadata: 'JSON',
        info: 'JSON'
      }
    )
  `)
  
  const result2 = await db.all(`
    SELECT 
      json_extract(p.unnest, '$.placement') as placement_extracted,
      json_type(json_extract(p.unnest, '$.placement')) as placement_type
    FROM test_direct m,
    UNNEST(json_transform_strict(m.info.participants, '["JSON"]')) AS p
    LIMIT 1
  `)
  
  console.log('\nResult from read_json with columns:')
  console.log('  Placement:', result2[0].placement_extracted, 'Type:', result2[0].placement_type)
  
  await db.close()
  
  // Cleanup
  fs.rmSync(dir, { recursive: true, force: true })
}

analyzeSaveIssue().catch(console.error)