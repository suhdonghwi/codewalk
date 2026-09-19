def fact(n):
    print("fact", n)
    if n <= 1:
        return 1
    return n * fact(n - 1)

for i in range(2):
    print(fact(i + 1))
