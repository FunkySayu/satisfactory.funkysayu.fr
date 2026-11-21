# Circuit Break Board

A web page that reads a Satisfactory save (`.sav`) or blueprints (`.sbp` + `.sbpcfg`) in your browser and checks your factory:

- **Power circuits**: every priority switch with what is behind it, its power balance now and at full load, nested switches, somersloops, augmenters and dimensional depot uploads.
- **Belt and pipe networks**: a max-flow solver per network finds bottlenecks, consumers that are not reached, surplus and deficits, overloaded belts, mixed fluids and head lift. Every problem opens a diagram of the network.
- **Coal power plants**: miner tier and clock, first belt tier, water extractor clocks, generators at 100% and connected to the main grid.
- **Blueprints**: everything connected, one power network, and what the blueprint needs and gives per minute.

Files are parsed in a web worker with [`@etothepii/satisfactory-file-parser`](https://github.com/etothepii4/satisfactory-file-parser) and never leave the browser.

## Run it

```sh
npm install
npm run dev          # http://localhost:5173
```

Or with Docker (nginx serves the page and its static data):

```sh
docker compose up --build   # http://localhost:51847
```

Files put in `./data/` are served under `/data/`, with CORS headers. Open them with the page parameters below.

| Parameter | |
|---|---|
| `?url=<save>` | Load a save from a URL (absolute, or `/data/...` on the same server). |
| `?bp_url=<archive>` | Load a blueprint folder packed as `.tar` / `.tar.gz` (paths `<session>/<name>.sbp`). |
| `?snapshot=<json>` | Open a pre-computed report (a `Snapshot`, see `src/report/types.ts`). |
| `?live_reload=1` | Check the URLs every second and reload what changed (uses `ETag` / `Last-Modified`). |

## Docker image

`.github/workflows/image.yml` typechecks and builds the image on every pull request, and publishes `ghcr.io/<owner>/<repo>:latest` on every push to `main`.

## Layout

```
src/
  model/        parses a save or blueprint and models it
                  satisfactory_save.ts: the only entry point, parseSatisfactorySave()
                  power.ts, logistics.ts, flows.ts, networks.ts, circuits.ts, blueprint.ts, ...
  analyzers/    one analyzer per file, each exporting XXX_ANALYZER: Analyzer
                  types.ts: Severity, Issue, View, Analyzer...   analyzers.ts: the list
  report/       model + analyzers -> the serializable report the page shows; the web worker
  app/          the page (React + Tailwind)
  static/       served as-is: gamedata.json, icons/
test/           Node harnesses for a save or a blueprint folder
```

The model only states facts (what each network carries, where its narrowest cut is, which belts would need more than their capacity, how high a pipe climbs). Analyzers decide what is a problem and write the messages. To add a check, write `src/analyzers/my_check.ts`:

```ts
export const MY_ANALYZER: Analyzer = {
  id: 'my-check', name: 'My check', description: '...',
  targets: ['save'],
  checks: { 'my.code': { title: '...', why: '...', fix: '...' } },
  run(save) { return [/* makeIssue(save, 'warn', 'build', 'my.code', 'message', building) */]; },
};
```

Then add it to `ANALYZERS` in `src/analyzers/analyzers.ts`.

## Scripts

```sh
npm run typecheck
npm run check -- "<save.sav>"            # every circuit and its issues, in Node
npm run check:bp -- "<blueprint folder>"
```

`src/static/gamedata.json` and `src/static/icons/` are generated from the Satisfactory Calculator data exports, which are not part of the repository.
