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

`mise run dev` executes the code you run **unsandboxed**, with your user's
privileges. The server therefore only listens on loopback and refuses any other
`HOST` unless `CODEWALK_ALLOW_UNSANDBOXED=1` is set. Do not expose the dev servers
to a network you do not trust; sandboxing (nsjail) is a later step.

Run all checks or apply automatic fixes:

```sh
mise run check
mise run fix
```
