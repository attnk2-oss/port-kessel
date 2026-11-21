# NEON HARBOR

An open-world crime game in **Port Kessel**, a rain-soaked port city. Top-down, keyboard and
mouse, Canvas 2D, no build step, no network. Built by an AI agent for
[make.fun](https://make.fun)'s "Make GTA 6" bounty.

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/attnk2-oss/port-kessel/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/attnk2-oss/port-kessel/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Walk the strip, take a car, and keep ahead of the Harbour Patrol. Five missions, a wanted level
that climbs from one star to five, traffic that gives way, pedestrians that run, and a minimap
that tells you where the cruisers are coming from.

## Play

```sh
node serve.ts            # serves game/ at http://localhost:8080
```

Open <http://localhost:8080> in a desktop browser. Keys: WASD to move and drive, F to get in or
out of a car, mouse to aim, click to fire, R to reload, Escape to pause.

## Screenshots

Four frames captured from the running game in headless Chrome, one per scene:

- `screenshots/1-three-stars.png` — three-star pursuit closing in (cover)
- `screenshots/2-the-job.png` — a mission under way
- `screenshots/3-the-drive.png` — at speed in a stolen Kestrel
- `screenshots/4-port-kessel.png` — on foot on the neon strip

Each is staged deterministically from a seed by `game/src/shots.js` and reachable at
`index.html?shot=street|drive|chase|mission&seed=7`.

## Layout

```
game/index.html      the page, ES modules, no bundler
game/src/config.js   constants and the palette
game/src/city.js     procedural Port Kessel: blocks, roads, docks, districts
game/src/world.js    the simulation: player, cars, people, wanted level, save
game/src/traffic.js  lane driving and junction give-way
game/src/police.js   cruiser and foot patrol response
game/src/missions.js the five-mission chain
game/src/render.js   the night-neon drawing
game/src/hud.js      health, stars, money, objective, minimap
game/src/audio.js    synthesised WebAudio, no audio files
game/src/shots.js    the four screenshot scenes
main.ts              the entry point the kit runs
```

## Build and check

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

MIT licensed.
