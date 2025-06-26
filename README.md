# TFT Match Data

This repository contains match data for TFT (Teamfight Tactics) collected from Riot Games API.

## Structure

```
match-data/
├── {patch}-{region}/
│   └── matches.json.gz
```

- **patch**: Game version (e.g., "14.24")
- **region**: Server region (e.g., "JP1", "NA1", "EUW1")
- **matches.json.gz**: GZIP compressed JSON array of match data

## Data Format

Each `matches.json.gz` file contains an array of match objects following the Riot API MatchDto format.

## Usage

This repository is used as a Git submodule by the main TFT statistics application.

## Updates

Data is automatically updated every 3 days by GitHub Actions.

## License

Match data is provided by Riot Games API and is subject to their terms of service.