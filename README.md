# ⚡ ClaudeXP

**Turn every Claude Code session into XP. Level up, unlock achievements, and climb the global leaderboard.**

[![npm](https://img.shields.io/npm/v/claudexp?color=cb3837&logo=npm)](https://www.npmjs.com/package/claudexp)
[![downloads](https://img.shields.io/npm/dm/claudexp?color=cb3837)](https://www.npmjs.com/package/claudexp)
[![stars](https://img.shields.io/github/stars/EvanPaules/ClaudeXP?style=flat&logo=github)](https://github.com/EvanPaules/ClaudeXP/stargazers)
![node](https://img.shields.io/badge/node-18%2B-brightgreen)
![license](https://img.shields.io/badge/license-MIT-blue)
![platform](https://img.shields.io/badge/platform-win%20%7C%20mac%20%7C%20linux-lightgrey)

---

Every time you end a Claude Code session, a Stop hook scores what you actually did — tool uses, files edited, bug fixes, features shipped — and a framed overlay pops up right in your terminal showing the XP you earned.

Your totals sync to a shared cloud leaderboard so you can see how you stack up against everyone else running ClaudeXP. Nobody's watching you work. Nobody asked you to. It just makes closing `/exit` feel like finishing a raid.

<!-- Drop a demo.gif here once recorded: ![demo](docs/demo.gif) -->


```
╭──────────────────────────────────────╮
│  ⚡ Claude Code XP  ·  Session done  │
├──────────────────────────────────────┤
│  +310 XP   Feature built  🚀         │
│  +25  XP   Session base              │
│  +100 XP   Tool uses ×21             │
│  +30  XP   Files edited ×3           │
│  +50  XP   Bug fix bonus             │
│  +75  XP   New feature bonus         │
│  +30  XP   Deep work bonus           │
├──────────────────────────────────────┤
│  🎉 LEVEL UP!  Now Pull Request Pro  │
│  Level 7 · Pull Request Pro          │
│  ███████████████░░░░░  77% to Lvl 8  │
╰──────────────────────────────────────╯
```

## Install

Requires Node 18+.

```bash
npm install -g claudexp
claudexp setup
```

`claudexp setup` drops the Stop hook into `~/.claude/settings.json` (safe JSON merge — nothing else gets touched) and claims your username on the community leaderboard.

End your next Claude Code session and the overlay pops up.

<details>
<summary>Prefer a one-liner installer?</summary>

**Windows (PowerShell)**

```powershell
irm https://raw.githubusercontent.com/EvanPaules/ClaudeXP/main/install.ps1 | iex
```

**macOS / Linux**

```bash
curl -fsSL https://raw.githubusercontent.com/EvanPaules/ClaudeXP/main/install.sh | bash
```

Same end state — these scripts check your Node version, `npm install -g claudexp`, then run `claudexp setup` for you.

</details>

<details>
<summary>Clone and link for development?</summary>

```bash
git clone https://github.com/EvanPaules/ClaudeXP
cd ClaudeXP
npm install
npm link
claudexp setup
```

</details>

## How XP works

| Signal                           | XP                      |
| -------------------------------- | ----------------------- |
| Session base                     | **+25**                 |
| Tool uses                        | **+5 each** (cap 100)   |
| Unique files written / edited    | **+10 each** (cap 80)   |
| Bug fix detected in transcript   | **+50**                 |
| New feature detected             | **+75**                 |
| Deep work (≥ 20 tool uses)       | **+30**                 |
| Streak (you shipped yesterday)   | **×1.15** to the total  |

ClaudeXP parses your session transcript (JSONL from Claude Code) and counts tool calls, unique file paths touched, and scans assistant responses for `fix`, `bug`, `feature`, `implement`, `refactor` — so a quick chat nets ~25 XP, a focused hour-long feature push can clear 300+.

## The ladder

Fifteen tiers from total noob to legend. XP is cumulative.

| Lvl | Title | XP |
|---:|:---|---:|
| 1  | Script Kiddie        | 0       |
| 2  | Bug Hunter           | 500     |
| 3  | Snippet Slinger      | 1,500   |
| 4  | Junior Dev           | 3,000   |
| 5  | Feature Builder      | 5,500   |
| 6  | Refactor Wizard      | 9,000   |
| 7  | Pull Request Pro     | 14,000  |
| 8  | Module Master        | 21,000  |
| 9  | System Thinker       | 30,000  |
| 10 | Code Architect       | 42,000  |
| 11 | Staff Engineer       | 57,000  |
| 12 | Senior Code Wrangler | 75,000  |
| 13 | Principal Dev        | 97,000  |
| 14 | Claude Whisperer     | 124,000 |
| 15 | 10x Legend           | 157,000 |

## Achievements

Eight trophies. Earned permanently once unlocked.

- 🩸 **First Blood** — complete your first session
- 🔥 **On a Roll** — 7-day coding streak
- 🧠 **Deep Diver** — 30+ tool uses in a single session
- 🐛 **Bug Slayer** — 10 bug-fix sessions total
- 🚀 **Ship It** — 10 feature sessions total
- 💯 **Century** — 100 total sessions
- 💰 **XP Millionaire** — reach 10,000 total XP
- 👑 **Legendary** — reach level 15

## Daily Quests

One quest per day, seeded from the UTC date — so everyone running ClaudeXP worldwide gets the same challenge. Complete it inside a single session and your overlay gets **+150 XP** tagged `Daily quest: "<label>" ✓`.

Run `claudexp quest` to see today's challenge and plan around it. Examples:

- Use 3+ different tool types
- Edit a test file
- Run a shell command
- Touch 5+ files in a single session
- Work past local midnight

The bonus caps at **one award per UTC day per user** — extra quest-completing sessions the same day still earn their normal session XP, they just don't stack the +150.

Resets at 00:00 UTC.

## Commands

| Command                                         | What it does                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| `claudexp stats`                                | Your profile — level, XP bar, streak, achievements               |
| `claudexp board`                                | The community leaderboard                                        |
| `claudexp board --local`                        | Force local-only                                                 |
| `claudexp history [--limit N]`                  | Recent sessions with XP and tags                                 |
| `claudexp achievements`                         | Unlocked + locked trophies                                       |
| `claudexp quest`                                | Show today's daily quest (+150 XP if completed in a session)     |
| `claudexp setup`                                | First-time install / rename / chain into cloud claim             |
| `claudexp hook install / uninstall / status`    | Manage the Stop hook in `~/.claude/settings.json`                |
| `claudexp cloud claim`                          | Claim a username on the community board                          |
| `claudexp cloud push`                           | Force-sync your current stats up                                 |
| `claudexp cloud status`                         | Show config + test connection                                    |
| `claudexp cloud delete`                         | Drop your profile from the leaderboard                           |
| `claudexp cloud configure`                      | Point at a different Supabase (self-host / override)             |
| `claudexp cloud reset`                          | Clear local override, revert to community default                |

## The leaderboard

Everyone running ClaudeXP lands on the same board. Your row updates every time you end a session.

```
☁️  Community Leaderboard
──────────────────────────────────────────────────────────────────────
Rank  Player                Level                     Total XP   Sessions
──────────────────────────────────────────────────────────────────────
#1    dan ←                7 Pull Request Pro        14,321     47
#2    alice                 5 Feature Builder         6,200      28
#3    bob                   3 Snippet Slinger         1,820      9
```

### How is this safe?

The community backend is a public Supabase project with row-level security. Anyone with the (public) anon key can:

- **read** any row (it's a leaderboard — that's the point)
- **insert** a new username (first come, first serve)
- **update / delete** *only their own row*

Each client generates a random 48-char **owner token** on first setup and stores it in `~/.claudexp/config.json` (chmod 600). Every update request sends an `x-claudexp-owner-token` header; RLS only lets the write through if it matches the token stored on your row. Tokens can't be scraped either — the `owner_token` column is hidden from anon reads via column-level grants.

TL;DR: if someone else claims your username first, pick another. If you lose your owner token you lose the ability to update that row — delete it from a machine that still has the token, or re-claim a fresh name.

## Running your own community

Want a private ClaudeXP for your team, company, or Discord?

1. **Fork this repo.**
2. **Create a Supabase project** (free tier handles hundreds of players).
3. **Run the schema.** Supabase → SQL Editor → paste `cloud_schema.sql` → Run.
4. **Bake in your credentials.** Clone your fork, then `claudexp set-community` — paste your project URL and anon public key. That writes `community.json`.
5. **Commit & push.** Anyone who installs from your fork auto-joins your board.

Tweak `engine.js` (scoring), `levels.js` (titles / curve), `achievements.js` (trophies) — make it yours.

## How the hook actually works

Claude Code fires a **Stop** hook at the end of each response cycle. `hook.js`:

1. Reads the JSON payload from stdin (`session_id`, `transcript_path`, …).
2. Parses the JSONL transcript, counting tool uses + unique files + scanning for fix / feature / refactor keywords.
3. Scores the session (`engine.js`) and writes a row to `~/.claudexp/data.db` (SQLite, synchronous — committed before you see the overlay).
4. Checks the 8 achievements for anything newly unlocked.
5. Prints the framed overlay to **stderr** so it appears in your terminal without interfering with Claude Code's stdout.
6. PATCHes your Supabase row with the owner token (3-second timeout; next session retries cumulative).

All in under a second. Close the terminal right after — your XP is already persisted.

## Stack

- Node ≥ 18, ESM
- [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) for the local DB
- [`chalk`](https://github.com/chalk/chalk) for color
- [`commander`](https://github.com/tj/commander.js) for the CLI
- Supabase + PostgREST via native `fetch` (no SDK)

Three dependencies. That's it.

## Data location

| What               | Where                                         |
| ------------------ | --------------------------------------------- |
| Local DB           | `~/.claudexp/data.db`                         |
| Local config       | `~/.claudexp/config.json` (chmod 600)         |
| Hook registration  | `~/.claude/settings.json` (auto-managed)      |
| Community config   | `community.json` inside the installed package |

## Uninstall

```bash
claudexp hook uninstall        # remove the Stop hook entry
claudexp cloud delete          # drop your cloud profile
npm uninstall -g claudexp      # remove the binary
rm -rf ~/.claudexp              # wipe local data
```

## Contributing

PRs welcome, especially for:

- More achievements (the more ridiculous, the better)
- Better keyword detection in the transcript parser
- Cross-platform bug reports (Windows quirks especially)
- A proper plugin form if/when Claude Code ships one

Open an issue before anything non-trivial. Keep dependencies at zero if humanly possible.

## License

MIT. Go nuts.
