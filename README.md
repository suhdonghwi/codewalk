# codewalk

A code execution visualizer: run a program, then navigate what happened as a
tree of windows on an infinite canvas — call by call, iteration by iteration,
with output shown inline where it was produced.

- [Design](docs/design.md)
- [Trace format](spec/trace-format.md) · [example trace](spec/fixtures/fact.trace.jsonl)

## Development

Install the pinned tools and project dependencies, then start both development
servers:

```sh
mise install
mise run install
mise run dev
```

To run the two servers separately (for example one per tmux pane):

```sh
mise run dev:server      # API on 127.0.0.1:3001, restarts on change
mise run dev:web         # web on http://localhost:5173, proxies /api to the API
```

Both listen on loopback only. To reach the app from other machines on your
tailnet, leave them as they are and let Tailscale proxy to the web server:

```sh
tailscale serve --bg --https=8443 http://127.0.0.1:5173
# → https://<machine>.<tailnet>.ts.net:8443
```

The web dev server accepts `*.ts.net` host names for this. Arguments after `--`
go to Vite (`mise run dev:web -- --port 5174`).

`mise run dev` executes the code you run **unsandboxed**, with your user's
privileges. The server therefore only listens on loopback and refuses any other
`HOST` unless `CODEWALK_ALLOW_UNSANDBOXED=1` is set. Do not expose the dev servers
to a network you do not trust; sandboxing (nsjail) is a later step.

Run all checks or apply automatic fixes:

```sh
mise run check
mise run fix
```
