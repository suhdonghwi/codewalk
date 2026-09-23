"""Structured snapshots of values and the object identities they refer to."""

import dataclasses
import math
import re
from collections import deque
from collections.abc import Callable, Iterator, Mapping
from itertools import chain, islice
from operator import is_
from types import (
    BuiltinFunctionType,
    BuiltinMethodType,
    CodeType,
    CoroutineType,
    FrameType,
    FunctionType,
    GeneratorType,
    MethodType,
    ModuleType,
    WrapperDescriptorType,
)
from typing import Any, NamedTuple

_MAX_ITEMS = 100

_MAX_OBJECTS = 200

_MAX_TEXT = 200

_SHORT_INTEGER = 10**18

_ADDRESS = re.compile(r" at 0x[0-9a-fA-F]+")

_OPAQUE = (
    type,
    FunctionType,
    BuiltinFunctionType,
    BuiltinMethodType,
    MethodType,
    ModuleType,
    GeneratorType,
    CoroutineType,
    CodeType,
    FrameType,
)


class Primitive(NamedTuple):
    kind: str
    text: str
    length: int | None = None


type Token = Primitive | int


class Shape(NamedTuple):
    kind: str
    type: str
    text: str | None
    items: tuple[Token, ...] = ()
    entries: tuple[tuple[Token, Token], ...] = ()
    fields: tuple[tuple[str, Token], ...] = ()
    length: int | None = None


class _Entry(NamedTuple):
    item: object
    kind: type
    size: int
    members: tuple[object, ...]
    shape: Shape
    children: tuple[object, ...]


class Snapshot:
    """A value and the objects it reaches, as they were when it was taken."""

    __slots__ = ("entries", "root")

    def __init__(self, root: Token, entries: dict[int, _Entry]) -> None:
        self.root = root
        self.entries = entries

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Snapshot) or self.root != other.root:
            return False
        if len(self.entries) != len(other.entries):
            return False
        for key, entry in self.entries.items():
            theirs = other.entries.get(key)
            if theirs is None or theirs.shape != entry.shape:
                return False
        return True


def snapshot(value: object, previous: Snapshot | None = None) -> Snapshot:
    """Take `value`, reusing what `previous` recorded for unchanged objects."""
    primitive = _primitive(value)
    if primitive is not None:
        return Snapshot(primitive, {})
    earlier = {} if previous is None else previous.entries
    entries: dict[int, _Entry] = {}
    queue: deque[object] = deque()
    seen: set[int] = set()
    children: list[object] = []

    def token(item: object) -> Token:
        primitive = _primitive(item)
        if primitive is not None:
            return primitive
        key = id(item)
        children.append(item)
        if key not in seen:
            seen.add(key)
            queue.append(item)
        return key

    root = token(value)
    while queue:
        item = queue.popleft()
        key = id(item)
        kind = type(item)
        name, size, members = _contents(item, opened=len(entries) < _MAX_OBJECTS)
        prior = earlier.get(key)
        if (
            prior is not None
            and prior.item is item
            and prior.kind is kind
            and prior.size == size
            and prior.shape.kind == name
            and len(prior.members) == len(members)
            and all(map(is_, prior.members, members))
        ):
            if prior.shape.text is not None and name != "opaque":
                text = _text_of(item, name)
                if text != prior.shape.text:
                    prior = prior._replace(shape=prior.shape._replace(text=text))
            for child in prior.children:
                child_key = id(child)
                if child_key not in seen:
                    seen.add(child_key)
                    queue.append(child)
            entries[key] = prior
            continue
        children.clear()
        shape = _shape(item, name, size, members, token)
        entries[key] = _Entry(item, kind, size, members, shape, tuple(children))
    return Snapshot(root, entries)


class Heap:
    """Assign object ids and define each object whenever its state changes."""

    def __init__(self, emit: Callable[[Mapping[str, object]], None]) -> None:
        self._emit = emit
        self._ids: dict[int, int] = {}
        self._alive: list[object] = []
        self._shapes: dict[int, Shape] = {}

    def define(self, taken: Snapshot) -> dict[str, object]:
        """Write the objects `taken` reaches that changed and return its value."""
        entries = taken.entries

        def value(item: Token) -> dict[str, object]:
            if isinstance(item, int):
                return {"ref": self._id(item, entries[item].item)}
            if item.length is None:
                return {"kind": item.kind, "text": item.text}
            return {"kind": item.kind, "text": item.text, "length": item.length}

        root = value(taken.root)
        shapes = self._shapes
        for key, entry in entries.items():
            shape = entry.shape
            if shapes.get(key) == shape:
                continue
            shapes[key] = shape
            object_id = self._id(key, entry.item)
            event: dict[str, object] = {
                "op": "obj",
                "id": object_id,
                "kind": shape.kind,
                "type": shape.type,
            }
            if shape.text is not None:
                event["text"] = shape.text
            if shape.kind in {"sequence", "set"}:
                event["items"] = [value(item) for item in shape.items]
            elif shape.kind == "mapping":
                event["entries"] = [[value(k), value(v)] for k, v in shape.entries]
            elif shape.kind == "record":
                event["fields"] = [[name, value(v)] for name, v in shape.fields]
            if shape.length is not None:
                event["length"] = shape.length
            self._emit(event)
        return root

    def _id(self, key: int, item: object) -> int:
        object_id = self._ids.get(key)
        if object_id is None:
            object_id = len(self._alive)
            self._ids[key] = object_id
            # Holding every identified object keeps CPython from reusing its
            # address for another object, which would merge their identities.
            self._alive.append(item)
        return object_id


def _primitive(value: object) -> Primitive | None:
    kind = type(value)
    if kind is bool:
        return Primitive("boolean", repr(value))
    if kind is int and isinstance(value, int):
        if -_SHORT_INTEGER < value < _SHORT_INTEGER:
            return Primitive("number", repr(value))
        return _integer(value)
    if (kind is str or kind is bytes) and isinstance(value, (str, bytes)):
        if len(value) <= _MAX_TEXT:
            return Primitive("string", repr(value))
        head = repr(value[:_MAX_TEXT])
        return Primitive("string", f"{head[:-1]}…{head[-1]}", len(value))
    if kind is float or kind is complex:
        return Primitive("number", repr(value))
    if value is None:
        return Primitive("null", "None")
    return None


def _integer(value: int) -> Primitive:
    size = abs(value)
    sign = "-" if value < 0 else ""
    if size.bit_length() <= 600:
        text = repr(size)
        if len(text) <= _MAX_TEXT:
            return Primitive("number", f"{sign}{text}")
        return Primitive("number", f"{sign}{text[:_MAX_TEXT]}…", len(text))
    digits = math.floor((size.bit_length() - 1) * math.log10(2)) + 1
    if 10 ** (digits - 1) > size:
        digits -= 1
    elif 10**digits <= size:
        digits += 1
    head = size // 10 ** (digits - _MAX_TEXT)
    return Primitive("number", f"{sign}{head}…", digits)


def _contents(item: object, *, opened: bool) -> tuple[str, int, tuple[object, ...]]:
    limit = _MAX_ITEMS if opened else 0
    kind = type(item)
    if (kind is list or kind is tuple) and isinstance(item, (list, tuple)):
        return "sequence", len(item), tuple(islice(item, limit))
    if isinstance(item, dict):
        entries = islice(dict.items(item), limit)
        return "mapping", dict.__len__(item), tuple(chain.from_iterable(entries))
    fields = _fields(item)
    if fields is not None:
        return "record", len(fields), tuple(chain.from_iterable(fields[:limit]))
    sequence = _sequence(item)
    if sequence is not None:
        size, members = sequence
        return "sequence", size, tuple(islice(members, limit))
    if isinstance(item, (set, frozenset)):
        size = set.__len__(item) if isinstance(item, set) else frozenset.__len__(item)
        return "set", size, tuple(_members(item)) if opened else ()
    if not isinstance(item, _OPAQUE):
        attributes = _attributes(item)
        if attributes is not None:
            members = tuple(chain.from_iterable(attributes[:limit]))
            return "record", len(attributes), members
    return "opaque", 0, ()


def _shape(
    item: object,
    kind: str,
    size: int,
    members: tuple[object, ...],
    token: Callable[[object], Token],
) -> Shape:
    name = type(item).__name__
    text = _text_of(item, kind)
    if kind == "opaque":
        return Shape(kind, name, text or f"<{name}>")
    pairs = zip(members[::2], members[1::2], strict=True)
    if kind == "mapping":
        entries = tuple((token(key), token(value)) for key, value in pairs)
        return Shape(kind, name, text, entries=entries, length=_length(entries, size))
    if kind == "record":
        fields = tuple((str(field), token(value)) for field, value in pairs)
        return Shape(kind, name, text, fields=fields, length=_length(fields, size))
    items = tuple(token(value) for value in members)
    return Shape(kind, name, text, items=items, length=_length(items, size))


def _text_of(item: object, kind: str) -> str | None:
    method = type(item).__repr__
    if kind == "opaque":
        return _text(item)
    if kind == "record":
        restates = (
            method is object.__repr__
            or getattr(method, "__module__", None) == "collections"
            or (dataclasses.is_dataclass(item) and hasattr(method, "__wrapped__"))
        )
        return None if restates else _text(item)
    if isinstance(method, WrapperDescriptorType):
        return None
    if getattr(method, "__module__", None) == "collections":
        return None
    return _text(item)


def _length(kept: tuple[object, ...], size: int) -> int | None:
    return None if len(kept) == size else size


def _sequence(item: object) -> tuple[int, Iterator[object]] | None:
    if isinstance(item, list):
        return list.__len__(item), list.__iter__(item)
    if isinstance(item, tuple):
        return tuple.__len__(item), tuple.__iter__(item)
    if isinstance(item, deque):
        return deque.__len__(item), deque.__iter__(item)
    return None


def _fields(item: object) -> list[tuple[str, object]] | None:
    if not isinstance(item, tuple):
        return None
    for base in type(item).__mro__:
        names = base.__dict__.get("_fields")
        if isinstance(names, tuple) and all(isinstance(name, str) for name in names):
            return list(zip(names, tuple.__iter__(item), strict=False))
    return None


def _members(item: set[Any] | frozenset[Any]) -> list[Any]:
    members = set.__iter__(item) if isinstance(item, set) else frozenset.__iter__(item)
    listed: list[Any] = list(islice(members, _MAX_ITEMS + 1))
    if len(listed) > _MAX_ITEMS:
        return listed[:_MAX_ITEMS]
    try:
        return sorted(listed)
    except BaseException:
        return listed


def _attributes(item: object) -> list[tuple[str, object]] | None:
    try:
        instance = object.__getattribute__(item, "__dict__")
    except BaseException:
        instance = None
    attributes: list[tuple[str, object]] | None = None
    if isinstance(instance, dict):
        attributes = [
            (name, value)
            for name, value in dict.items(instance)
            if isinstance(name, str)
        ]
    for kind in type(item).__mro__:
        slots = kind.__dict__.get("__slots__", ())
        for slot in (slots,) if isinstance(slots, str) else slots:
            if slot in {"__dict__", "__weakref__"}:
                continue
            if attributes is None:
                attributes = []
            private = slot.startswith("__") and not slot.endswith("__")
            stored = f"_{kind.__name__.lstrip('_')}{slot}" if private else slot
            try:
                attributes.append((slot, object.__getattribute__(item, stored)))
            except BaseException:
                continue
    return attributes


def _text(item: object) -> str | None:
    if type(item).__repr__ is object.__repr__:
        return None
    try:
        text = repr(item)
    except BaseException:
        return None
    if not isinstance(text, str):
        return None
    text = _ADDRESS.sub("", text)
    text = text.replace("\r\n", " ").replace("\r", " ").replace("\n", " ")
    if len(text) > _MAX_TEXT:
        return f"{text[: _MAX_TEXT - 1]}…"
    return text
