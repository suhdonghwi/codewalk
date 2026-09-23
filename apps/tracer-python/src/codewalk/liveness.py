"""Live-variable analysis: the state a loop takes in and the state it hands on."""

import ast
import symtable
from collections.abc import Collection, Iterable
from dataclasses import dataclass

type Names = tuple[str, ...]

_COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)

_COMPOUND = (
    ast.AsyncFor,
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

_DYNAMIC_SCOPE = frozenset({"dir", "eval", "exec", "globals", "locals", "vars"})


def loop_state(loop: ast.For | ast.While) -> list[str]:
    """Names one iteration may read before assigning them, in first-read order."""
    body = _Live(frozenset()).block(loop.body, (), _Exits())
    if isinstance(loop, ast.For):
        targets: set[str] = set()
        _bind_names(loop.target, targets)
        return list(_minus(body, targets))
    reads, bound = _expression_effect(loop.test)
    return list(_union(reads, _minus(body, bound)))


def live_after_loops(
    body: list[ast.stmt], scope: symtable.SymbolTable
) -> dict[ast.stmt, frozenset[str]]:
    """Names the scope may still read once each loop in its body has ended."""
    if any(
        symbol.get_name() in _DYNAMIC_SCOPE
        and symbol.is_global()
        and symbol.is_referenced()
        for symbol in scope.get_symbols()
    ):
        return {}
    live = _Live(_escaping(scope))
    live.block(body, (), _Exits())
    return live.after


def function_scope(
    scope: symtable.SymbolTable, node: ast.FunctionDef
) -> symtable.SymbolTable | None:
    """The symbol table of a function defined anywhere inside `scope`."""
    for child in scope.get_children():
        if (
            child.get_type() == symtable.SymbolTableType.FUNCTION
            and child.get_name() == node.name
            and child.get_lineno() == node.lineno
        ):
            return child
        found = function_scope(child, node)
        if found is not None:
            return found
    return None


def loop_assigns(loop: ast.For | ast.While) -> set[str]:
    """Names the loop's condition or body may assign in the enclosing scope."""
    assigns = _Assigns()
    if isinstance(loop, ast.While):
        assigns.visit(loop.test)
    for statement in loop.body:
        assigns.visit(statement)
    return set(assigns.names)


def statement_bindings(node: ast.stmt) -> list[str]:
    """Names a statement binds itself, not through the body it heads."""
    bindings = _Bindings()
    if isinstance(node, (ast.If, ast.While)):
        bindings.visit(node.test)
    elif isinstance(node, (ast.For, ast.AsyncFor)):
        bindings.visit(node.iter)
    elif isinstance(node, (ast.With, ast.AsyncWith)):
        for item in node.items:
            bindings.visit(item)
    elif isinstance(node, ast.Match):
        bindings.visit(node.subject)
    elif not isinstance(node, _COMPOUND):
        bindings.visit(node)
    return list(bindings.names)


def target_names(target: ast.expr) -> list[str]:
    """Names a `for` target binds."""
    bindings = _Bindings()
    bindings.visit(target)
    return list(bindings.names)


def _escaping(scope: symtable.SymbolTable) -> frozenset[str]:
    names = {
        symbol.get_name()
        for child in scope.get_children()
        for symbol in child.get_symbols()
        if symbol.is_free()
    }
    if scope.get_type() == symtable.SymbolTableType.MODULE:
        names |= _global_reads(scope)
    else:
        names |= {
            symbol.get_name()
            for symbol in scope.get_symbols()
            if symbol.is_global()
            or symbol.is_free()
            or (symbol.is_parameter() and not symbol.is_assigned())
        }
    return frozenset(names)


def _global_reads(scope: symtable.SymbolTable) -> set[str]:
    names: set[str] = set()
    for child in scope.get_children():
        names |= {
            symbol.get_name()
            for symbol in child.get_symbols()
            if symbol.is_global() and symbol.is_referenced()
        }
        names |= _global_reads(child)
    return names


def _union(*parts: Iterable[str]) -> Names:
    return tuple(dict.fromkeys(name for part in parts for name in part))


def _minus(names: Names, removed: Collection[str]) -> Names:
    return tuple(name for name in names if name not in removed)


def _expression_effect(node: ast.expr) -> tuple[Names, set[str]]:
    reads = _Reads()
    bound: set[str] = set()
    reads.expression(node, bound, definite=True)
    return tuple(reads.names), bound


@dataclass(frozen=True)
class _Exits:
    brk: Names = ()
    cont: Names = ()
    ret: Names = ()
    throw: Names = ()


class _Live:
    def __init__(self, escaping: frozenset[str]) -> None:
        self.escaping = escaping
        self.after: dict[ast.stmt, frozenset[str]] = {}

    def block(self, statements: list[ast.stmt], out: Names, exits: _Exits) -> Names:
        for statement in reversed(statements):
            out = _union(self.statement(statement, out, exits), exits.throw)
        return out

    def statement(self, node: ast.stmt, out: Names, exits: _Exits) -> Names:
        if isinstance(node, ast.Break):
            return exits.brk
        if isinstance(node, ast.Continue):
            return exits.cont
        if isinstance(node, ast.Return):
            if node.value is None:
                return exits.ret
            return _union(_expression_effect(node.value)[0], exits.ret)
        if isinstance(node, ast.Raise):
            reads = _Reads()
            for part in (node.exc, node.cause):
                if part is not None:
                    reads.expression(part, set(), definite=True)
            return tuple(reads.names)
        if isinstance(node, ast.If):
            reads, bound = _expression_effect(node.test)
            branches = _union(
                self.block(node.body, out, exits), self.block(node.orelse, out, exits)
            )
            return _union(reads, _minus(branches, bound))
        if isinstance(node, (ast.While, ast.For)):
            return self._loop(node, out, exits)
        if isinstance(node, (ast.With, ast.AsyncWith)):
            items = _Reads()
            bound: set[str] = set()
            for item in node.items:
                items.expression(item.context_expr, bound, definite=True)
                if item.optional_vars is not None:
                    items.target(item.optional_vars, bound, definite=True)
            body = self.block(node.body, out, exits)
            return _union(items.names, _minus(body, bound))
        if isinstance(node, (ast.Try, ast.TryStar)):
            return self._try(node, out, exits)
        if isinstance(node, ast.Match):
            return self._match(node, out, exits)
        reads = _Reads()
        bound = set()
        reads.statement(node, bound)
        return _union(reads.names, _minus(out, bound))

    def _loop(self, node: ast.While | ast.For, out: Names, exits: _Exits) -> Names:
        ended = self.block(node.orelse, out, exits)
        self.after[node] = frozenset(ended) | frozenset(out) | self.escaping
        targets: set[str] = set()
        if isinstance(node, ast.For):
            _bind_names(node.target, targets)
        head: Names = ()
        while True:
            inner = _Exits(out, head, exits.ret, exits.throw)
            body = self.block(node.body, head, inner)
            if isinstance(node, ast.For):
                reached = _union(ended, _minus(body, targets))
            else:
                reads, bound = _expression_effect(node.test)
                reached = _union(reads, _minus(_union(ended, body), bound))
            if set(reached) == set(head):
                break
            head = reached
        if isinstance(node, ast.While):
            return head
        reads, bound = _expression_effect(node.iter)
        return _union(reads, _minus(head, bound))

    def _try(self, node: ast.Try | ast.TryStar, out: Names, exits: _Exits) -> Names:
        def through_finally(names: Names) -> Names:
            return self.block(node.finalbody, names, exits)

        inner = _Exits(
            through_finally(exits.brk),
            through_finally(exits.cont),
            through_finally(exits.ret),
            through_finally(exits.throw),
        )
        after = through_finally(out)
        handlers: Names = ()
        for handler in node.handlers:
            caught = self.block(handler.body, after, inner)
            if handler.name is not None:
                caught = _minus(caught, {handler.name})
            if handler.type is not None:
                caught = _union(_expression_effect(handler.type)[0], caught)
            handlers = _union(handlers, caught)
        orelse = self.block(node.orelse, after, inner)
        guarded = _Exits(
            inner.brk, inner.cont, inner.ret, _union(inner.throw, handlers)
        )
        return self.block(node.body, orelse, guarded)

    def _match(self, node: ast.Match, out: Names, exits: _Exits) -> Names:
        reads, bound = _expression_effect(node.subject)
        cases: Names = ()
        for case in node.cases:
            pattern = _Reads()
            captured: set[str] = set()
            pattern.pattern(case.pattern, captured)
            if case.guard is not None:
                pattern.expression(case.guard, captured, definite=True)
            body = self.block(case.body, out, exits)
            cases = _union(cases, pattern.names, _minus(body, captured))
        return _union(reads, _minus(_union(cases, out), bound))


class _Reads:
    def __init__(self) -> None:
        self.names: list[str] = []

    def statement(self, node: ast.stmt, assigned: set[str]) -> None:
        if isinstance(node, ast.Expr):
            self.expression(node.value, assigned, definite=True)
        elif isinstance(node, ast.Assign):
            self.expression(node.value, assigned, definite=True)
            for target in node.targets:
                self.target(target, assigned, definite=True)
        elif isinstance(node, ast.AugAssign):
            if isinstance(node.target, ast.Name):
                self._read(node.target, assigned)
            self.target(node.target, assigned, definite=False)
            self.expression(node.value, assigned, definite=True)
            self.target(node.target, assigned, definite=True)
        elif isinstance(node, ast.AnnAssign):
            if node.value is not None:
                self.expression(node.value, assigned, definite=True)
            self.target(node.target, assigned, definite=node.value is not None)
        elif isinstance(node, ast.Delete):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    assigned.add(target.id)
                else:
                    self.target(target, assigned, definite=False)
        elif isinstance(node, ast.Assert):
            self.expression(node.test, assigned, definite=True)
            if node.msg is not None:
                self.expression(node.msg, assigned, definite=False)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for decorator in node.decorator_list:
                self.expression(decorator, assigned, definite=True)
            for default in [*node.args.defaults, *node.args.kw_defaults]:
                if default is not None:
                    self.expression(default, assigned, definite=True)
            assigned.add(node.name)
        elif isinstance(node, ast.ClassDef):
            for part in [*node.decorator_list, *node.bases]:
                self.expression(part, assigned, definite=True)
            for keyword in node.keywords:
                self.expression(keyword.value, assigned, definite=True)
            assigned.add(node.name)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                if alias.name != "*":
                    assigned.add(alias.asname or alias.name.split(".")[0])
        elif isinstance(node, ast.TypeAlias):
            self.target(node.name, assigned, definite=True)

    def pattern(self, node: ast.pattern, assigned: set[str]) -> None:
        if isinstance(node, ast.MatchValue):
            self.expression(node.value, assigned, definite=True)
        elif isinstance(node, (ast.MatchAs, ast.MatchStar)):
            if isinstance(node, ast.MatchAs) and node.pattern is not None:
                self.pattern(node.pattern, assigned)
            if node.name is not None:
                assigned.add(node.name)
        elif isinstance(node, ast.MatchSequence):
            for pattern in node.patterns:
                self.pattern(pattern, assigned)
        elif isinstance(node, ast.MatchMapping):
            for key in node.keys:
                self.expression(key, assigned, definite=True)
            for pattern in node.patterns:
                self.pattern(pattern, assigned)
            if node.rest is not None:
                assigned.add(node.rest)
        elif isinstance(node, ast.MatchClass):
            self.expression(node.cls, assigned, definite=True)
            for pattern in [*node.patterns, *node.kwd_patterns]:
                self.pattern(pattern, assigned)
        elif isinstance(node, ast.MatchOr):
            for pattern in node.patterns:
                self.pattern(pattern, set(assigned))

    def target(self, node: ast.expr, assigned: set[str], *, definite: bool) -> None:
        if isinstance(node, ast.Name):
            if definite:
                assigned.add(node.id)
        elif isinstance(node, (ast.Tuple, ast.List)):
            for item in node.elts:
                self.target(item, assigned, definite=definite)
        elif isinstance(node, ast.Starred):
            self.target(node.value, assigned, definite=definite)
        elif isinstance(node, ast.Attribute):
            self.expression(node.value, assigned, definite=definite)
        elif isinstance(node, ast.Subscript):
            self.expression(node.value, assigned, definite=definite)
            self.expression(node.slice, assigned, definite=definite)

    def expression(self, node: ast.expr, assigned: set[str], *, definite: bool) -> None:
        if isinstance(node, ast.Name):
            if isinstance(node.ctx, ast.Load):
                self._read(node, assigned)
        elif isinstance(node, ast.NamedExpr):
            self.expression(node.value, assigned, definite=definite)
            self.target(node.target, assigned, definite=definite)
        elif isinstance(node, ast.BoolOp):
            first, *rest = node.values
            self.expression(first, assigned, definite=definite)
            for value in rest:
                self.expression(value, assigned, definite=False)
        elif isinstance(node, ast.IfExp):
            self.expression(node.test, assigned, definite=definite)
            self.expression(node.body, assigned, definite=False)
            self.expression(node.orelse, assigned, definite=False)
        elif isinstance(node, ast.Lambda):
            for default in [*node.args.defaults, *node.args.kw_defaults]:
                if default is not None:
                    self.expression(default, assigned, definite=definite)
            arguments = node.args
            inner = assigned | {
                argument.arg
                for argument in [
                    *arguments.posonlyargs,
                    *arguments.args,
                    *arguments.kwonlyargs,
                    arguments.vararg,
                    arguments.kwarg,
                ]
                if argument is not None
            }
            self.expression(node.body, inner, definite=False)
        elif isinstance(node, _COMPREHENSIONS):
            self._comprehension(node, assigned)
        else:
            for child in ast.iter_child_nodes(node):
                if isinstance(child, ast.expr):
                    self.expression(child, assigned, definite=definite)
                elif isinstance(child, ast.keyword):
                    self.expression(child.value, assigned, definite=definite)

    def _comprehension(
        self,
        node: ast.ListComp | ast.SetComp | ast.DictComp | ast.GeneratorExp,
        assigned: set[str],
    ) -> None:
        inner = set(assigned)
        for generator in node.generators:
            self.expression(generator.iter, inner, definite=False)
            _bind_names(generator.target, inner)
            for condition in generator.ifs:
                self.expression(condition, inner, definite=False)
        if isinstance(node, ast.DictComp):
            self.expression(node.key, inner, definite=False)
            self.expression(node.value, inner, definite=False)
        else:
            self.expression(node.elt, inner, definite=False)

    def _read(self, node: ast.Name, assigned: set[str]) -> None:
        if node.id not in assigned and node.id not in self.names:
            self.names.append(node.id)


def _bind_names(node: ast.expr, assigned: set[str]) -> None:
    if isinstance(node, ast.Name):
        assigned.add(node.id)
    elif isinstance(node, (ast.Tuple, ast.List)):
        for item in node.elts:
            _bind_names(item, assigned)
    elif isinstance(node, ast.Starred):
        _bind_names(node.value, assigned)


class _Bindings(ast.NodeVisitor):
    def __init__(self) -> None:
        self.names: dict[str, None] = {}

    def visit_Name(self, node: ast.Name) -> None:
        if isinstance(node.ctx, ast.Store):
            self.names[node.id] = None

    def visit_Lambda(self, node: ast.Lambda) -> None:
        pass

    def visit_comprehension(self, node: ast.comprehension) -> None:
        self.visit(node.iter)
        for condition in node.ifs:
            self.visit(condition)


class _Assigns(_Bindings):
    def visit_Name(self, node: ast.Name) -> None:
        if isinstance(node.ctx, (ast.Store, ast.Del)):
            self.names[node.id] = None

    def visit_ExceptHandler(self, node: ast.ExceptHandler) -> None:
        if node.name is not None:
            self.names[node.name] = None
        self.generic_visit(node)

    def visit_MatchAs(self, node: ast.MatchAs) -> None:
        if node.name is not None:
            self.names[node.name] = None
        self.generic_visit(node)

    def visit_MatchStar(self, node: ast.MatchStar) -> None:
        if node.name is not None:
            self.names[node.name] = None

    def visit_MatchMapping(self, node: ast.MatchMapping) -> None:
        if node.rest is not None:
            self.names[node.rest] = None
        self.generic_visit(node)

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self.names[node.name] = None

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self.names[node.name] = None

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        self.names[node.name] = None
