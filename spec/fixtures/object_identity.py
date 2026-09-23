from collections import deque, namedtuple
from dataclasses import dataclass

Point = namedtuple("Point", "x y")


@dataclass
class Node:
    value: int
    next: "Node | None" = None


def push(stack, item):
    stack.append(item)


shared = []
pair = [shared, shared]
push(shared, Point(1, 2))
head = Node(1, Node(2))
head.next.next = head
counts = {"a": {1, 2}}
queue = deque([1, 2])
