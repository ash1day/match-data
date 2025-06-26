# TFT Match Data

This repository contains match and player data for TFT (Teamfight Tactics) collected from Riot Games API.

## Structure

```
├── matches/
│   └── {patch}-{region}/
│       └── matches.json.gz
└── players/
    └── {region}/
        └── players.json.gz
```

### Matches
- **patch**: Game version (e.g., "14.24")
- **region**: Server region (e.g., "JP1", "NA1", "EUW1")
- **matches.json.gz**: GZIP compressed JSON array of match data

### Players
- **region**: Server region
- **players.json.gz**: GZIP compressed JSON array of high-tier player data (Challenger/Grandmaster/Master)

## Data Format

Each `matches.json.gz` file contains an array of match objects following the Riot API MatchDto format.

## Usage

This repository is used as a Git submodule by the main TFT statistics application.

## Updates

Data is automatically updated every 3 days by GitHub Actions.

## License

Match data is provided by Riot Games API and is subject to their terms of service.