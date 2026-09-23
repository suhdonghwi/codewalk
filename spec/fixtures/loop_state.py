def search(items, target):
    lo, hi = 0, len(items)
    while lo < hi:
        mid = (lo + hi) // 2
        if items[mid] < target:
            lo = mid + 1
        else:
            hi = mid
    return lo


def remember(items, item):
    items.append(item)


print(search([1, 3, 5, 7], 5))

seen = []
for word in ["a", "b", "a", "c"]:
    if word not in seen:
        remember(seen, word)

for n in [3, 1]:
    step = 0
    if n > 1:
        last = n
    print(last)

heads = []
tail = []
for i in range(3):
    if i < 2:
        heads.append(i)
    else:
        tail.append(i)

misses = 0
for even in [2, 4]:
    if even % 2:
        misses += 1
