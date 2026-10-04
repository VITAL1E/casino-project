---
name: ship
description: Build, commit and push to main, then verify the GitHub Pages deploy. Use when the user says /ship or asks to commit and push.
---

1. `npx tsc -b` and `npm run build` in `client/`; stop on failure.
2. `git status`; confirm no `.env` or secrets are staged.
3. Commit with a short message plus the attribution line from the system reminder, then `git push origin main`.
4. Check the run: `curl -s "https://api.github.com/repos/VITAL1E/casino-project/actions/runs?per_page=3"` and report status/conclusion of "Deploy Pages".
