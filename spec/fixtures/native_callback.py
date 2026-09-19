def key(number):
    print("key", number)
    return -number


print(sorted([1, 2], key=key))
