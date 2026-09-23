def search(items, target):
    lo, hi = 0, len(items)
    while lo < hi:
        mid = (lo + hi) // 2
        if items[mid] < target:
            lo = mid + 1
        else:
            hi = mid
    return lo


print(search([1, 3, 5, 7], 5))

seen = []
for word in ["a", "b", "a"]:
    if word not in seen:
        seen.append(word)

for n in [3, 1]:
    if n > 1:
        last = n
    print(last)
