def values():
    print("generator")
    yield 1


show = lambda: print("lambda")
print(next(values()))
show()
