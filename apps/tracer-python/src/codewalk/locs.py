"""Source ranges and trace location records."""

import ast
import bisect
import io
import tokenize
from typing import Literal, TypedDict


class Loc(TypedDict, total=False):
    role: Literal["block", "stmt", "expr"]
    title: str
    unit: str
    file: int
    start: int
    end: int
    parent: int | None
    rebinds: list[str]


_COMPOUND = (
    ast.AsyncFunctionDef,
    ast.AsyncWith,
    ast.ClassDef,
    ast.For,
    ast.FunctionDef,
    ast.If,
    ast.Match,
    ast.Try,
    ast.TryStar,
    ast.While,
    ast.With,
)


class SourceMap:
    """Convert parser positions to absolute UTF-16 offsets."""

    def __init__(self, text: str) -> None:
        self.text = text
        self._lines = text.splitlines(keepends=True)
        if not self._lines or self._lines[-1].endswith(("\n", "\r")):
            self._lines.append("")
        self._line_starts: list[int] = []
        offset = 0
        for line in self._lines:
            self._line_starts.append(offset)
            offset += _utf16_len(line)
        self._tokens: list[tokenize.TokenInfo] = []
        tokens = tokenize.generate_tokens(io.StringIO(text).readline)
        try:
            while True:
                self._tokens.append(next(tokens))
        except (StopIteration, tokenize.TokenError, SyntaxError):
            pass
        self._token_starts = [token.start for token in self._tokens]

    def parser_position(self, line: int, byte_column: int) -> int:
        """Translate an AST UTF-8 byte column into an absolute UTF-16 offset."""
        line_text = self._lines[line - 1]
        prefix = line_text.encode("utf-8")[:byte_column].decode(
            "utf-8", errors="ignore"
        )
        return self._line_starts[line - 1] + _utf16_len(prefix)

    def character_position(self, line: int, column: int) -> int:
        """Translate a tokenize character column into an absolute UTF-16 offset."""
        return self._line_starts[line - 1] + _utf16_len(self._lines[line - 1][:column])

    def node_range(self, node: ast.expr | ast.stmt) -> tuple[int, int]:
        line = node.lineno
        column = node.col_offset
        end_line = node.end_lineno
        end_column = node.end_col_offset
        if end_line is None or end_column is None:
            start = self.parser_position(line, column)
            return start, start
        return (
            self.parser_position(line, column),
            self.parser_position(end_line, end_column),
        )

    def argument_range(self, node: ast.arg) -> tuple[int, int]:
        index = bisect.bisect_left(
            self._token_starts, (node.lineno, self._character_column(node))
        )
        token = self._tokens[index]
        return (
            self.character_position(*token.start),
            self.character_position(*token.end),
        )

    def statement_range(self, node: ast.stmt) -> tuple[int, int]:
        if not isinstance(node, _COMPOUND):
            return self.node_range(node)
        first = bisect.bisect_left(
            self._token_starts, (node.lineno, self._character_column(node))
        )
        return self._header_range(first) or self.node_range(node)

    def handler_range(self, node: ast.ExceptHandler) -> tuple[int, int] | None:
        """The `except ...:` header of a handler."""
        first = bisect.bisect_left(
            self._token_starts, (node.lineno, self._character_column(node))
        )
        return self._header_range(first)

    def clause_range(self, keyword: str, after: ast.stmt) -> tuple[int, int] | None:
        """The `keyword:` header right after `after`, if the next name is it."""
        if after.end_lineno is None or after.end_col_offset is None:
            return None
        line = self._lines[after.end_lineno - 1]
        column = len(line.encode("utf-8")[: after.end_col_offset].decode("utf-8"))
        first = bisect.bisect_left(self._token_starts, (after.end_lineno, column))
        for index in range(first, len(self._tokens)):
            token = self._tokens[index]
            if token.type == tokenize.NAME:
                return self._header_range(index) if token.string == keyword else None
        return None

    def case_range(self, node: ast.match_case) -> tuple[int, int] | None:
        """The `case ...:` header of a match case."""
        pattern = node.pattern
        index = bisect.bisect_left(
            self._token_starts, (pattern.lineno, self._character_column(pattern))
        )
        while index > 0:
            index -= 1
            token = self._tokens[index]
            if token.type == tokenize.NAME and token.string == "case":
                return self._header_range(index)
        return None

    def _header_range(self, first: int) -> tuple[int, int] | None:
        start = self.character_position(*self._tokens[first].start)
        depth = 0
        for token in self._tokens[first:]:
            if token.type != tokenize.OP:
                continue
            if token.string in "([{":
                depth += 1
            elif token.string in ")]}":
                depth -= 1
            elif token.string == ":" and depth == 0:
                return start, self.character_position(*token.end)
        return None

    def module_range(self) -> tuple[int, int]:
        return 0, _utf16_len(self.text.rstrip("\r\n"))

    def syntax_range(self, error: SyntaxError) -> tuple[int, int]:
        # Unlike AST columns (UTF-8 bytes), SyntaxError offsets are 1-based
        # character columns.
        if error.lineno is None or error.offset is None:
            return 0, 0
        start = self._clamped_character_position(error.lineno, max(error.offset - 1, 0))
        if error.end_lineno is None or error.end_offset is None:
            end = start
        else:
            end = self._clamped_character_position(
                error.end_lineno, max(error.end_offset - 1, 0)
            )
        limit = _utf16_len(self.text)
        return min(start, limit), min(max(end, start), limit)

    def _clamped_character_position(self, line: int, column: int) -> int:
        if line > len(self._lines):
            return _utf16_len(self.text)
        return self.character_position(max(line, 1), column)

    def _character_column(
        self, node: ast.arg | ast.expr | ast.stmt | ast.ExceptHandler | ast.pattern
    ) -> int:
        line = self._lines[node.lineno - 1]
        return len(line.encode("utf-8")[: node.col_offset].decode("utf-8"))


def _utf16_len(text: str) -> int:
    return len(text.encode("utf-16-le")) // 2
