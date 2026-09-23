def first_even(numbers):
    for n in numbers:
        if n % 2 == 0:
            return n
    return None


def build():
    items = [1]
    return items


def stop():
    return


result = build()
result.append(2)
first_even([1, 4])
stop()
