# Discord Data Analyzer

A **local** web app that loads your Discord data export (ZIP or folder) and shows summaries and charts. Nothing is sent to the internet; everything runs in your browser.

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
cd discord-data-analyzer
npm install
npm run dev
```

Open http://localhost:3000.

## Load options

1. **Drag & drop** the Discord export ZIP onto the load screen.
2. **Choose ZIP file** and select the `.zip` you downloaded.
3. **Choose folder** and select the unzipped export folder (or use the browser’s folder picker if available).

## Tech

- **React** + **Vite** (single-page app).
- **JSZip** to read the export ZIP in the browser.
- **Recharts** for charts.
- **File System Access API** (where supported) for folder selection; otherwise the “Choose folder” input uses the directory input.

All parsing and stats run in the browser; no backend and no data upload.

**Optional AI summary (Message lookup):** If you use “Generate AI summary”, the app sends a sample of message text to OpenAI using **your own** API key (stored only in your browser). No data is sent to any server unless you add that key and click the button.

### Safe to share and self-host

You can build the app and send the project (or the built `dist/` folder) to friends. They can run it locally or host the static files on any server. Discord export data is never uploaded; everything stays in the user’s browser.

## Project structure

```
discord-data-analyzer/
├── src/
│   ├── parser/
│   │   └── discordExportParser.js   # ZIP + folder parsing, message/channel detection
│   ├── utils/
│   │   └── exportData.js            # CSV/JSON download helpers
│   ├── components/
│   │   ├── LoadScreen.jsx           # Drag-drop + file/folder picker
│   │   └── Layout.jsx                # Sidebar nav + export buttons
│   ├── views/
│   │   ├── Overview.jsx
│   │   ├── Messages.jsx
│   │   ├── Activity.jsx
│   │   ├── Servers.jsx
│   │   └── DMs.jsx
│   ├── App.jsx
│   └── main.jsx
├── package.json
├── vite.config.js
└── README.md
```

## Discord export format (reference)

- **messages/** – One folder per channel (folder name = Channel ID). Each folder has:
  - A JSON file with channel metadata (Guild ID, Channel ID, Channel Name, or User IDs for DMs).
  - A JSON file with the message transcript: array of `{ ID, Timestamp, Contents, Attachments }`.
- **account/**, **activity/**, **servers/** – Optional JSON data.

The parser supports both the documented structure and small variations (e.g. different field names).
# discord-package-analyzer
