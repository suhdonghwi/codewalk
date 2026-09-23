def find(rows, target):
    for row in rows:
        for item in row:
            if item == target:
                return item


find([[1], [2, 3]], 2)
