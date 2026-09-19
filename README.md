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

Run all checks or apply automatic fixes:

```sh
mise run check
mise run fix
```
