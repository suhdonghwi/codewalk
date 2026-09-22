def helper():
    print("hidden helper")


class Loud:
    def __repr__(self):
        print("hidden repr")
        helper()
        return "Loud()"


def identity(value):
    return value


def collect(item, /, default=(), *args, flag=True, **kwargs):
    for index, value in enumerate(args):
        print(index, value)
    return identity(default)


long_values = list(range(30))
print(collect(Loud(), long_values, "x", "y", flag=False, extra=1))
print(collect(Loud()))
