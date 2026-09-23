for x in [1, 2, 3]:
    if x < 2:
        kind = "small"
    elif x == 2:
        kind = "two"
    else:
        kind = "big"

try:
    int("x")
except ValueError:
    kind = "error"
else:
    kind = "fine"
finally:
    kind = kind + "!"

for y in [1]:
    pass
else:
    kind = "done"

match kind:
    case "done":
        kind = 1
    case _:
        kind = 2
