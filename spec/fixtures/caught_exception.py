import json


def fail():
    raise ValueError("caught")


try:
    fail()
except ValueError:
    print("caught")

value = None
try:
    value = json.loads("{")
except json.JSONDecodeError:
    print("caught here")
