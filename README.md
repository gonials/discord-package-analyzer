# Discord Package Analyzer

A web app that loads your Discord data export (ZIP or folder) and shows summaries and charts.

## What it does

- **Load** your official Discord data package (ZIP from “Request a copy of your data”) or an unzipped folder.
- **Summarize** messages (total count, per server/channel, words, attachments).
- **Charts**: messages over time (daily), active hours heatmap, activity by day of week.
- **Servers**: list of servers and channels with message counts.
- **DMs**: top DM conversations by message count.
- **Export** summary as JSON or channels table as CSV.

## How to get your Discord data

1. In Discord: **User Settings** → **Data & Privacy** → **Request your data** (or “Request all of my data”).
2. Choose what to include (e.g. Messages, Account, Activity).
3. Wait for the email (can take up to 30 days); download the ZIP before the link expires.
4. Use that ZIP (or unzip it and select the folder) in this app.

## Run the app

```bash
cd discord-package-analyzer
npm install
npm run dev
```
