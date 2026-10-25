# Admin scripts

Run every script from the project root (locally or on the Lightsail host):

```sh
node scripts/<script>.js [arguments]
```

All scripts use the same `database.sqlite` as the app.

## Users

| Command | What it does |
| --- | --- |
| `node scripts/addUser.js <username> <password>` | Adds a user. New users start with Pictionary (and so Wie ben ik) switched off; they can switch it on in Settings. |

## Pictionary words

### Review

```sh
node scripts/word-dashboard.js [--min-ratings=3] [--consensus=50] [--drop=50]
```

One overview of the word lists:

1. Summary statistics: word counts per difficulty, users, rating distribution, most-rated and unrated words.
2. Suggested words that have enough ratings, with a recommendation and the exact command to run.
3. Existing words whose difficulty might need to change.
4. Words players often want removed.

Options:

- `--min-ratings=N`: minimum number of ratings before a word is considered (default 3).
- `--consensus=N`: percentage needed to agree on a difficulty (default 50).
- `--drop=N`: percentage of "drop" ratings needed to recommend removal (default 50).

### Apply changes

| Command | What it does |
| --- | --- |
| `node scripts/auto-process.js [--min-ratings=4] [--consensus=70] [--drop=60]` | Applies every recommendation that meets the thresholds (stricter defaults than the dashboard): suggestions, difficulty changes and removals. |
| `node scripts/accept-suggestion.js <suggestion-id> <difficulty>` | Accepts a suggested word, e.g. `5 medium`. |
| `node scripts/reject-suggestion.js <suggestion-id>` | Rejects a suggested word. |
| `node scripts/add-word.js "<word>" <difficulty>` | Adds a word to a list. |
| `node scripts/remove-word.js "<word>"` | Removes a word from all lists. |
| `node scripts/change-difficulty.js "<word>" <from> <to>` | Moves a word, e.g. `"Computer" medium hard`. |

Difficulties are `easy`, `medium` and `hard`. The lists live in `data/Pictionary_{easy,medium,hard}.csv`.

### How recommendations are made

Only words with at least `--min-ratings` ratings are considered.

- **Suggestions:** rejected when the share of "drop" ratings reaches `--drop`. Otherwise accepted when the share agreeing on one difficulty reaches `--consensus`.
- **Difficulty changes:** suggested when the share rating a word as another difficulty reaches `--consensus`.
- **Removal:** suggested when the share of "drop" ratings reaches `--drop`.

### Tables

- `pictionary_word_ratings`: one rating per user per word (`easy`, `medium`, `hard`, `drop`).
- `pictionary_word_suggestions`: suggested words (`pending`, `accepted`, `rejected`).

## Development only

| Command | What it does |
| --- | --- |
| `node scripts/generate-images.js <outDir> [model] [styles...]` | Generates candidate site images with Gemini (needs `GEMINI_API_KEY`). Writes only to `<outDir>`. |

## Troubleshooting

- **"Cannot find module":** run the script from the project root.
- **Empty results:** check that `database.sqlite` is in the project root.
