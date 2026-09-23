def sign(n):
    if n < 0:
        return -1
    return n


streak = 0
for n in [3, -2]:
    if sign(n) > 0:
        streak = streak + 1
    else:
        streak = 0
low, high = 0, sign(5)
