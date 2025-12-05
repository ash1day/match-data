# Clockworker (時計仕掛けのマッチ収集人)

TFT (Teamfight Tactics) マッチデータ収集スクリプト。GitHub Actions で定期実行。

## 仕組み

1. JPサーバーの上位200人から最新パッチを自動検出
2. 各リージョンからマッチデータを収集（最新パッチのみ）
3. S3にアップロード

## Data Structure (S3)

```
s3://tftips/match-data/
└── {region}/
    ├── players.json.gz     # 上位プレイヤーデータ
    └── {patch}/
        ├── matches.parquet # マッチデータ (Parquet)
        └── index.json.gz   # マッチID一覧
```

## Setup

```bash
yarn install
cp .env.example .env
# RIOT_API_KEY, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY を設定
```

## Commands

```bash
# マッチ収集（全リージョン）
yarn collect-matches

# オプション
yarn collect-matches --regions=JP1,KR --max-matches=1000

# プレイヤーデータ収集
yarn collect-players
```

## GitHub Actions

- **Collect Matches**: 1日2回 (12:00, 24:00 JST)
- **Collect Players**: 手動実行

手動実行時は `max_matches` と `regions` を指定可能。

## License

Riot Games API の利用規約に従う。
