# Setup

## Prerequisites

- Node.js 20+
- AWS credentials (S3 access)
- Riot API key

## Installation

```bash
yarn install
cp .env.example .env
# Edit .env: RIOT_API_KEY, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
```

## Commands

```bash
# Collect matches (all regions)
yarn collect-matches

# With options
yarn collect-matches --regions=JP1,KR --max-matches=1000

# Collect players
yarn collect-players
```

## How it works

1. Detect latest patch from JP server (sample 200 players)
2. Collect matches from all regions (latest patch only)
3. Upload to S3

## Data Structure (S3)

```
s3://tftips/match-data/
└── {region}/
    ├── players.json.gz
    └── {patch}/
        ├── matches.parquet
        └── index.json.gz
```

## GitHub Actions

- **Collect Matches**: 2x daily (12:00, 24:00 JST)
- **Collect Players**: Manual trigger

Parameters: `max_matches`, `regions`
