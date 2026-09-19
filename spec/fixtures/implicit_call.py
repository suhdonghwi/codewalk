class Item:
    def __lt__(self, other):
        print("lt")
        return True


print(Item() < Item())
