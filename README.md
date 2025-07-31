# Match Data

This repository contains match and player data for TFT (Teamfight Tactics) collected from Riot Games API.

## Structure

```
└── {region}/
    ├── players.json.gz     # High-tier player data
    └── {patch}/
        ├── matches.parquet # Match data in Parquet format
        └── index.json.gz   # Match ID index
```

### Example

```
├── JP1/
│   ├── players.json.gz
│   ├── 1515.00/
│   │   ├── matches.parquet
│   │   └── index.json.gz
│   └── 1514.00/
│       ├── matches.parquet
│       └── index.json.gz
├── NA1/
│   ├── players.json.gz
│   └── 1515.00/
│       ├── matches.parquet
│       └── index.json.gz
└── KR/
    ├── players.json.gz
    └── 1515.00/
        ├── matches.parquet
        └── index.json.gz
```

### Data Format

- **region**: Server region (e.g., "JP1", "NA1", "EUW1", "KR", "BR1", etc.)
- **players.json.gz**: High-tier player data (Challenger/Grandmaster/Master)
- **matches.parquet**: Match data in compressed Parquet format for efficient storage and querying
- **index.json.gz**: List of match IDs in the corresponding matches.parquet file

## Scripts

### Setup

```bash
yarn install
cp .env.example .env
# Edit .env and add your RIOT_API_KEY
```

### Collecting Data

```bash
# Collect player data (run first)
yarn collect-players

# Collect match data
yarn collect-matches
```

## Automated Collection

Data is automatically collected daily by GitHub Actions:

- Player data: Daily at 20:00 JST
- Match data: Daily at 21:00 JST

## Development

```bash
# Install dependencies
yarn install

# Run linting
yarn lint

# Fix linting issues
yarn fix
```

## Data Format

### Players Data (players.json.gz)

Compressed JSON file containing an array of player objects:

```json
[
  {
    "summonerId": "...",
    "summonerName": "...",
    "puuid": "...",
    "riotTag": "...",
    "tier": "CHALLENGER",
    "division": null,
    "leaguePoints": 1234
  }
]
```

### Match Data (matches.parquet)

Parquet format containing match objects following the Riot API MatchDto format.

## License

Match data is provided by Riot Games API and is subject to their terms of service.
