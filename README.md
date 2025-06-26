# TFT Match Data

This repository contains match and player data for TFT (Teamfight Tactics) collected from Riot Games API.

## Structure

```
└── {region}/
    ├── players.json.gz
    └── matches/
        └── {patch}.json.gz
```

### Example
```
├── JP1/
│   ├── players.json.gz
│   └── matches/
│       ├── 14.24.json.gz
│       └── 14.23.json.gz
├── NA1/
│   ├── players.json.gz
│   └── matches/
│       └── 14.24.json.gz
└── EUW1/
    ├── players.json.gz
    └── matches/
        └── 14.24.json.gz
```

### Data Format
- **region**: Server region (e.g., "JP1", "NA1", "EUW1", "KR")
- **players.json.gz**: High-tier player data (Challenger/Grandmaster/Master)
- **{patch}.json.gz**: Match data for specific game version

## Data Format

Each `matches.json.gz` file contains an array of match objects following the Riot API MatchDto format.

## Usage

This repository is used as a Git submodule by the main TFT statistics application.

## Updates

Data is automatically updated every 3 days by GitHub Actions.

## License

Match data is provided by Riot Games API and is subject to their terms of service.