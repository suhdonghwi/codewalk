def fail():
    raise ValueError("caught")


try:
    fail()
except ValueError:
    print("caught")
