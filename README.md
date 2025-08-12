# Match Data Collection Scripts

This repository contains **scripts only** for collecting TFT (Teamfight Tactics) match data from Riot Games API.

## ⚠️ Data Storage

**All data is stored in AWS S3. This repository contains no data files, only collection scripts.**

## Data Structure in S3

Data is stored in S3 bucket `tftips` under the `match-data/` prefix:

```
s3://tftips/match-data/
└── {region}/
    ├── players.json.gz     # High-tier player data
    └── {patch}/
        ├── matches.parquet # Match data in Parquet format
        └── index.json.gz   # Match ID index
```

### Data Format

- **region**: Server region (e.g., "JP1", "NA1", "EUW1", "KR", "BR1", etc.)
- **players.json.gz**: High-tier player data (Challenger/Grandmaster/Master)
- **matches.parquet**: Match data in compressed Parquet format
- **index.json.gz**: List of match IDs for deduplication

## Setup

### Prerequisites
- Node.js 18+
- AWS credentials with access to `tftips` S3 bucket
- Riot API key

### Environment Setup

```bash
yarn install
cp .env.example .env
# Edit .env and add:
# - RIOT_API_KEY
# - AWS_ACCESS_KEY_ID
# - AWS_SECRET_ACCESS_KEY
```

## Data Collection Workflow

The collection process follows this flow:
1. **Download** existing data from S3
2. **Fetch** new data from Riot API (incremental/diff only)
3. **Upload** merged data back to S3

### Commands

```bash
# Check S3 status
yarn s3:status

# Collect player data
yarn collect-players

# Full collection workflow (download → fetch diff → upload)
yarn collect-matches

# Manual S3 operations
yarn s3:download  # Download from S3
yarn s3:upload    # Upload to S3
```

## Automated Collection

Data is automatically collected daily by GitHub Actions:

- Player data: Daily at 20:00 JST
- Match data: Daily at 21:00 JST
- **S3 Upload**: Automatically uploads to S3 on push to main branch
- **Manual Sync**: Use GitHub Actions workflow for manual upload/download

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
