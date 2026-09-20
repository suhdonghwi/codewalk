def below(n, limit):
    print("check", n)
    return n < limit


i = 0
while below(i, 1):
    i += 1
else:
    print("done")

while below(i, 9):
    break
else:
    print("unreachable")
