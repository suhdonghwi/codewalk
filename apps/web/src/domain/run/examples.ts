export interface Example {
  name: string;
  source: string;
  stdin: string;
}

export const EXAMPLES: readonly [Example, ...Example[]] = [
  {
    name: "Factorial",
    source: `def fact(n):
    print("fact", n)
    if n <= 1:
        return 1
    return n * fact(n - 1)

for i in range(2):
    print(fact(i + 1))
`,
    stdin: "",
  },
  {
    name: "Fibonacci with memo",
    source: `memo = {}

def fib(n):
    if n in memo:
        return memo[n]
    if n < 2:
        result = n
    else:
        result = fib(n - 1) + fib(n - 2)
    memo[n] = result
    return result

print(fib(6))
`,
    stdin: "",
  },
  {
    name: "FizzBuzz",
    source: `for n in range(1, 16):
    if n % 15 == 0:
        print("FizzBuzz")
    elif n % 3 == 0:
        print("Fizz")
    elif n % 5 == 0:
        print("Buzz")
    else:
        print(n)
`,
    stdin: "",
  },
  {
    name: "Binary search",
    source: `def search(items, target):
    lo, hi = 0, len(items)
    while lo < hi:
        mid = (lo + hi) // 2
        if items[mid] < target:
            lo = mid + 1
        else:
            hi = mid
    return lo

primes = [2, 3, 5, 7, 11, 13, 17, 19, 23]
print(search(primes, 13))
print(search(primes, 4))
`,
    stdin: "",
  },
  {
    name: "Bubble sort",
    source: `def bubble_sort(items):
    for end in range(len(items) - 1, 0, -1):
        swapped = False
        for i in range(end):
            if items[i] > items[i + 1]:
                items[i], items[i + 1] = items[i + 1], items[i]
                swapped = True
        if not swapped:
            break
    return items

print(bubble_sort([5, 1, 4, 2, 8]))
`,
    stdin: "",
  },
  {
    name: "Breadth-first search",
    source: `from collections import deque

graph = {
    "a": ["b", "c"],
    "b": ["d"],
    "c": ["d", "e"],
    "d": ["f"],
    "e": ["f"],
    "f": [],
}

def shortest_path(start, goal):
    queue = deque([[start]])
    seen = {start}
    while queue:
        path = queue.popleft()
        node = path[-1]
        if node == goal:
            return path
        for neighbour in graph[node]:
            if neighbour not in seen:
                seen.add(neighbour)
                queue.append(path + [neighbour])
    return None

print(shortest_path("a", "f"))
`,
    stdin: "",
  },
  {
    name: "Classes",
    source: `class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        self.items.append(item)

    def pop(self):
        return self.items.pop()

def balanced(text):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = Stack()
    for char in text:
        if char in "([{":
            stack.push(char)
        elif char in pairs:
            if not stack.items or stack.pop() != pairs[char]:
                return False
    return not stack.items

print(balanced("(a[b]{c})"))
print(balanced("(]"))
`,
    stdin: "",
  },
  {
    name: "Sort with a key",
    source: `words = ["banana", "Apple", "cherry", "date"]

def key(word):
    print("key", word)
    return (len(word), word.lower())

print(sorted(words, key=key))
print([word.upper() for word in words if "a" in word])
`,
    stdin: "",
  },
  {
    name: "Read input",
    source: `n = int(input())
total = 0
for _ in range(n):
    name, score = input().split()
    total += int(score)
    print(name, "scored", score)
print("average", round(total / n, 1))
`,
    stdin: `3
ada 91
alan 78
grace 85
`,
  },
  {
    name: "Uncaught exception",
    source: `def average(numbers):
    return sum(numbers) / len(numbers)

def report(groups):
    for name, numbers in groups.items():
        print(name, average(numbers))

report({"first": [3, 4, 5], "second": [], "third": [1]})
`,
    stdin: "",
  },
];
