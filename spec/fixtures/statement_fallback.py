class Bag:
    def __setitem__(self, key, value):
        print("set", key, value)


bag = Bag()
bag[0] = 1
