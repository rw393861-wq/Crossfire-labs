# Crossfire Lab

Three AI fighters (Kestrel, Harrow, Juniper) learn a top-down firefight from scratch in the browser.
They sense the arena only through raycasts, pick their own loadouts, and keep their brains between visits.

## What they choose from

| Slot | Options |
|------|---------|
| Main | Rifle, Shotgun, Sniper |
| Alt | Pistol, SMG, Revolver |
| Utility | Grenade, Medkit, Molotov |

Grenades have a randomised fuse and throw 14 to 24 shrapnel fragments, each with random angle jitter, speed, range and damage.
Molotovs leave a fire patch with random size and burn time. Medkits heal over 1.5 seconds and slow the fighter while used.

## How learning works

- Each fighter casts 14 rays (11 forward, 3 behind). Each ray gives wall distance, enemy contact and hazard contact (fire, live grenade). Enemy contact widens with distance so far enemies do not slip between rays.
- A target sensor casts a line-of-sight ray to the nearest enemy inside a 120 degree view and reports the angle off the crosshair (coarse and fine), distance and enemy health.
- A crosshair ray reports whether the gun is lined up on an enemy right now.
- A neural network (68 inputs, 32 and 16 hidden, 9 outputs) drives move, strafe, turn, fire, weapon swap, utility, throw strength and two memory values that feed back in next tick.
- Training uses evolution strategies with mirrored sampling. Each fighter keeps one main brain and builds 16 variants per batch (8 noise directions, each tried plus and minus). One variant plays each life (up to 25 seconds). When all 16 have played, the main brain takes a small Adam step toward the better-ranked variants. Ranking instead of raw score stops one lucky life from yanking the brain around.
- Loadouts are a separate learner per slot: each option keeps a running score and better options get picked more often, with some exploration.
- Fighters think every second physics tick (30 decisions per second) and hold their controls in between. This is about 1.7x more training per second.

## Reward sheet

Each life (up to 25 s) is scored from these events. Results always count in full. Coaching points start at 100% and fade to 35% over a fighter's first 300 brain updates. All weights live in `js/reward.js`.

| Results | Points |
|---|---|
| Damage dealt, per HP | +1 |
| Kill | +40 |
| Assist (hit the victim in the 4 s before someone else's kill) | +15 |
| Damage taken, per HP | -0.5 |
| Death | -20 |
| Self damage, per HP | -1 |
| Medkit healing actually restored, per HP | +0.5 |
| Medkit used at full health | -5 |

| Coaching | Points |
|---|---|
| First sighting of each enemy per life | +3 |
| Enemy in view, per second | +0.5 |
| Turning onto target, per radian closed (turning away loses it) | +6 |
| Crosshair on an enemy, per second | +3 |
| Trigger pull on target | +0.3 |
| Trigger pull with enemy visible but off target | -0.1 |
| Trigger pull with no enemy in view | -0.3 |
| Hit, per bullet or pellet | +1 |
| Accuracy bonus (hit rate, 6+ shots) | +15 x rate |
| In an enemy's crosshair, per second | -1 |
| New 100 px square visited (max 30 per life) | +1 |
| Pushing into a wall, per second | -1 |
| Grenade or molotov that hurts no enemy | -3 |

Each card has a "Where the points came from" list for the current game.

Aim accuracy shows per fighter for the current game and the last 20 games. The chart toggles between reward and accuracy.

## Best games

Every finished game is kept as an exact replay: the game seed plus a snapshot of all three brains at kickoff. The simulation uses its own seeded random number generator, so playback repeats the game shot for shot. The 8 highest-action games (kills and damage) and the latest game are kept. Open them from Menu, Best games. Replays can be paused, sped up to 16x and scrubbed.

Replays live in browser storage (about 130 KB each). If the simulation code changes later, older replays may drift; the viewer says so when that happens.

## Saving

- Progress autosaves to the browser (localStorage) after every game, every 30 seconds and when the tab closes.
- localStorage belongs to one browser on one site address. To move brains, use **Export brains** in the menu and **Import brains** on the other device.
- To ship trained brains with the site: export, keep the file name `brains.json`, put it next to `index.html` and push. Any visitor with no local save starts from those brains.

## Run locally

Double click `index.html`. Everything works from a file except auto loading `brains.json` (use Import brains instead).

## Deploy to GitHub Pages

### Option A: GitHub website only

1. Go to https://github.com/new, name the repo `crossfire-lab`, set it Public, create it.
2. Click **uploading an existing file**, drag every file and folder from this project in (index.html, css, js, README.md, .nojekyll), then **Commit changes**.
   If `.nojekyll` is hidden in File Explorer, turn on View > Show > Hidden items. The site still works without it.
3. Open **Settings > Pages**. Under **Build and deployment** pick **Deploy from a branch**, branch `main`, folder `/ (root)`, then **Save**.
4. Wait about a minute. The site appears at `https://rw393861-wq.github.io/crossfire-lab/`.

### Option B: PowerShell with git

Create the empty repo `crossfire-lab` on GitHub first (no README), then:

```powershell
cd $HOME\Downloads
Expand-Archive .\crossfire-lab.zip -DestinationPath .\crossfire-lab -Force
cd .\crossfire-lab
git init
git add .
git commit -m "Crossfire Lab"
git branch -M main
git remote add origin https://github.com/rw393861-wq/crossfire-lab.git
git push -u origin main
```

Then turn on Pages as in step 3 above.

### Updating shipped brains later

```powershell
cd $HOME\Downloads\crossfire-lab
Move-Item $HOME\Downloads\brains.json .\brains.json -Force
git add brains.json
git commit -m "Update trained brains"
git push
```

## Netlify

Drag the project folder (or the zip) onto https://app.netlify.com/drop.

## Controls

Space pause, R rays, 1 to 6 speed, Esc menu.

## Files

- `js/nn.js` seeded random numbers, neural net, base64 weight packing
- `js/weapons.js` gun and utility stats
- `js/world.js` maps and ray geometry
- `js/reward.js` reward weights, labels and coaching schedule
- `js/sim.js` game rules, sensing, combat, grenades, fire, reward event tracking
- `js/learner.js` evolution strategies training and loadout picking
- `js/storage.js` save, load, export, replay library
- `js/render.js` arena and chart drawing
- `js/main.js` menu, panel, replay viewer, speed and game loop
