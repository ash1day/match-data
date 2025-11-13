# Player Collection Statistics

## Overview

This document tracks the statistics of player data collection from Riot Games API.

## Collection Policy

- **Tiers**: Challenger, Grandmaster, Master, Diamond (4 tiers)
- **Regions**: All 11 regions
- **Update Method**: Full reset and recreate (not incremental update)
- **Execution**: Manual workflow_dispatch only (no scheduled runs)

## Latest Collection Results

### 2025-11-13 (Initial Full Collection)

**Execution Time**: 41 minutes 24 seconds
**Status**: Success
**Total Players**: 392,356

#### Breakdown by Region

| Region | Code | Players |
|--------|------|---------|
| Japan | JP1 | 8,089 |
| Korea | KR | 102,512 |
| EU West | EUW1 | 40,042 |
| North America | NA1 | 32,263 |
| Brazil | BR1 | 12,616 |
| EU East | EUN1 | 14,108 |
| Latin America North | LA1 | 6,823 |
| Latin America South | LA2 | 6,679 |
| Oceania | OC1 | 4,544 |
| Turkey | TR1 | 9,020 |
| Vietnam | VN2 | 155,660 |

#### Notes

- Vietnam (VN2) has significantly more players than other regions
- Korea (KR) is the second largest region with over 100k players
- Execution time is well within the 180-minute timeout limit
- All regions collected successfully in parallel batches of 3

## Historical Data

Future collection runs will be logged here with date, total count, and any notable changes.
