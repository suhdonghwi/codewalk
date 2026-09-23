"""Static analysis of the state a loop takes in and hands on."""

import ast
from collections.abc import Sequence
from dataclasses import dataclass

type Assigned = set[str] | None

type Live = frozenset[str]

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
    reads = _Reads()
    assigned: set[str] = set()
    if isinstance(loop, ast.For):
        _bind_names(loop.target, assigned)
    else:
        reads.expression(loop.test, assigned, definite=True)
    reads.block(loop.body, assigned)
    return reads.names


def loop_assigns(loop: ast.For | ast.While) -> set[str]:
    """Names the loop's condition or body may assign in the enclosing scope."""
    assigns = _Assigns()
    if isinstance(loop, ast.While):
        assigns.visit(loop.test)
    for statement in loop.body:
        assigns.visit(statement)
    return set(assigns.names)


def live_after_loops(
    body: list[ast.stmt], parameters: Sequence[str] = ()
) -> dict[ast.stmt, Live]:
    """Names the scope may still read once each loop in its body has ended."""
    scope = _Scope()
    for statement in body:
        scope.visit(statement)
    if scope.dynamic:
        return {}
    assigns = _Assigns()
    for statement in body:
        assigns.visit(statement)
    kept = {name for name in parameters if name not in assigns.names}
    live = _Live(frozenset(scope.declared | scope.captured | kept))
    live.block(body, frozenset(), _Exits())
    return live.after


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


class _Reads:
    def __init__(self) -> None:
        self.names: list[str] = []

    def block(self, statements: list[ast.stmt], assigned: Assigned) -> Assigned:
        for statement in statements:
            if assigned is None:
                return None
            assigned = self.statement(statement, assigned)
        return assigned

    def statement(self, node: ast.stmt, assigned: set[str]) -> Assigned:
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
                    assigned.discard(target.id)
                else:
                    self.target(target, assigned, definite=False)
        elif isinstance(node, ast.Return):
            if node.value is not None:
                self.expression(node.value, assigned, definite=True)
            return None
        elif isinstance(node, ast.Raise):
            for part in (node.exc, node.cause):
                if part is not None:
                    self.expression(part, assigned, definite=True)
            return None
        elif isinstance(node, (ast.Break, ast.Continue)):
            return None
        elif isinstance(node, ast.Assert):
            self.expression(node.test, assigned, definite=True)
            if node.msg is not None:
                self.expression(node.msg, assigned, definite=False)
        elif isinstance(node, ast.If):
            self.expression(node.test, assigned, definite=True)
            return _join(
                self.block(node.body, set(assigned)),
                self.block(node.orelse, set(assigned)),
            )
        elif isinstance(node, (ast.For, ast.AsyncFor)):
            self.expression(node.iter, assigned, definite=True)
            body = set(assigned)
            self.target(node.target, body, definite=True)
            self.block(node.body, body)
            self.block(node.orelse, set(assigned))
        elif isinstance(node, ast.While):
            self.expression(node.test, assigned, definite=True)
            self.block(node.body, set(assigned))
            self.block(node.orelse, set(assigned))
        elif isinstance(node, (ast.With, ast.AsyncWith)):
            for item in node.items:
                self.expression(item.context_expr, assigned, definite=True)
                if item.optional_vars is not None:
                    self.target(item.optional_vars, assigned, definite=True)
            return self.block(node.body, assigned)
        elif isinstance(node, (ast.Try, ast.TryStar)):
            return self._try(node, assigned)
        elif isinstance(node, ast.Match):
            self.expression(node.subject, assigned, definite=True)
            for case in node.cases:
                bound = set(assigned)
                self._pattern(case.pattern, bound)
                if case.guard is not None:
                    self.expression(case.guard, bound, definite=True)
                self.block(case.body, bound)
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
        return assigned

    def _try(self, node: ast.Try | ast.TryStar, assigned: set[str]) -> Assigned:
        ends = [self.block(node.orelse, self.block(node.body, set(assigned)))]
        for handler in node.handlers:
            if handler.type is not None:
                self.expression(handler.type, set(assigned), definite=True)
            bound = set(assigned)
            if handler.name is not None:
                bound.add(handler.name)
            ends.append(self.block(handler.body, bound))
        joined = _join(*ends)
        final = self.block(node.finalbody, set(assigned))
        if joined is None or final is None:
            return None
        return joined | final

    def _pattern(self, node: ast.pattern, assigned: set[str]) -> None:
        if isinstance(node, ast.MatchValue):
            self.expression(node.value, assigned, definite=True)
        elif isinstance(node, (ast.MatchAs, ast.MatchStar)):
            if isinstance(node, ast.MatchAs) and node.pattern is not None:
                self._pattern(node.pattern, assigned)
            if node.name is not None:
                assigned.add(node.name)
        elif isinstance(node, ast.MatchSequence):
            for pattern in node.patterns:
                self._pattern(pattern, assigned)
        elif isinstance(node, ast.MatchMapping):
            for key in node.keys:
                self.expression(key, assigned, definite=True)
            for pattern in node.patterns:
                self._pattern(pattern, assigned)
            if node.rest is not None:
                assigned.add(node.rest)
        elif isinstance(node, ast.MatchClass):
            self.expression(node.cls, assigned, definite=True)
            for pattern in [*node.patterns, *node.kwd_patterns]:
                self._pattern(pattern, assigned)
        elif isinstance(node, ast.MatchOr):
            for pattern in node.patterns:
                self._pattern(pattern, set(assigned))

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


def _join(*states: Assigned) -> Assigned:
    reached = [state for state in states if state is not None]
    if not reached:
        return None
    return set.intersection(*reached)


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


@dataclass(frozen=True)
class _Exits:
    brk: Live = frozenset()
    cont: Live = frozenset()
    ret: Live = frozenset()
    throw: Live = frozenset()


class _Live:
    def __init__(self, escaping: Live) -> None:
        self.escaping = escaping
        self.after: dict[ast.stmt, Live] = {}

    def block(self, statements: list[ast.stmt], out: Live, exits: _Exits) -> Live:
        for statement in reversed(statements):
            out = self.statement(statement, out, exits) | exits.throw
        return out

    def statement(self, node: ast.stmt, out: Live, exits: _Exits) -> Live:
        if isinstance(node, ast.Return):
            return _loads(node) | exits.ret
        if isinstance(node, ast.Raise):
            return _loads(node)
        if isinstance(node, ast.Break):
            return exits.brk
        if isinstance(node, ast.Continue):
            return exits.cont
        if isinstance(node, ast.If):
            return (
                _loads(node.test)
                | self.block(node.body, out, exits)
                | self.block(node.orelse, out, exits)
            )
        if isinstance(node, (ast.While, ast.For)):
            return self._loop(node, out, exits)
        if isinstance(node, (ast.With, ast.AsyncWith)):
            bound: set[str] = set()
            reads: set[str] = set()
            for item in node.items:
                reads |= _loads(item.context_expr)
                if item.optional_vars is not None:
                    reads |= _loads(item.optional_vars)
                    _bind_names(item.optional_vars, bound)
            return (self.block(node.body, out, exits) - bound) | reads
        if isinstance(node, (ast.Try, ast.TryStar)):
            return self._try(node, out, exits)
        if isinstance(node, ast.Match):
            live = _loads(node.subject) | out
            for case in node.cases:
                live |= _loads(case.pattern) | self.block(case.body, out, exits)
                if case.guard is not None:
                    live |= _loads(case.guard)
            return live
        if isinstance(node, ast.AugAssign) and isinstance(node.target, ast.Name):
            return out | _loads(node) | {node.target.id}
        return (out - _kills(node)) | _loads(node)

    def _loop(self, node: ast.While | ast.For, out: Live, exits: _Exits) -> Live:
        ended = self.block(node.orelse, out, exits)
        self.after[node] = ended | out | self.escaping
        targets: set[str] = set()
        if isinstance(node, ast.For):
            _bind_names(node.target, targets)
            entry = ended | _loads(node.target)
        else:
            entry = ended | _loads(node.test)
        head: Live = frozenset()
        while True:
            inner = _Exits(out, head, exits.ret, exits.throw)
            reached = entry | (self.block(node.body, head, inner) - targets)
            if reached == head:
                break
            head = reached
        return _loads(node.iter) | head if isinstance(node, ast.For) else head

    def _try(self, node: ast.Try | ast.TryStar, out: Live, exits: _Exits) -> Live:
        def through_finally(live: Live) -> Live:
            return self.block(node.finalbody, live, exits)

        inner = _Exits(
            through_finally(exits.brk),
            through_finally(exits.cont),
            through_finally(exits.ret),
            through_finally(exits.throw),
        )
        after = through_finally(out)
        handlers: Live = frozenset()
        for handler in node.handlers:
            caught = self.block(handler.body, after, inner)
            if handler.name is not None:
                caught -= {handler.name}
            if handler.type is not None:
                caught |= _loads(handler.type)
            handlers |= caught
        orelse = self.block(node.orelse, after, inner)
        guarded = _Exits(inner.brk, inner.cont, inner.ret, inner.throw | handlers)
        return self.block(node.body, orelse, guarded)


def _loads(node: ast.AST) -> Live:
    names: set[str] = set()
    pending = [node]
    while pending:
        current = pending.pop()
        if isinstance(current, ast.Name):
            if isinstance(current.ctx, ast.Load):
                names.add(current.id)
        elif isinstance(current, (ast.FunctionDef, ast.AsyncFunctionDef)):
            pending.extend(current.decorator_list)
            pending.append(current.args)
            if current.returns is not None:
                pending.append(current.returns)
        elif isinstance(current, ast.Lambda):
            pending.append(current.args)
        else:
            pending.extend(ast.iter_child_nodes(current))
    return frozenset(names)


def _kills(node: ast.stmt) -> set[str]:
    bound: set[str] = set()
    if isinstance(node, ast.Assign):
        for target in node.targets:
            _bind_names(target, bound)
    elif isinstance(node, ast.AnnAssign) and node.value is not None:
        _bind_names(node.target, bound)
    elif isinstance(node, ast.Delete):
        for target in node.targets:
            if isinstance(target, ast.Name):
                bound.add(target.id)
    elif isinstance(node, (ast.Import, ast.ImportFrom)):
        for alias in node.names:
            if alias.name != "*":
                bound.add(alias.asname or alias.name.split(".")[0])
    elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        bound.add(node.name)
    return bound


class _Scope(ast.NodeVisitor):
    def __init__(self) -> None:
        self.declared: set[str] = set()
        self.captured: set[str] = set()
        self.dynamic = False

    def visit_Global(self, node: ast.Global) -> None:
        self.declared.update(node.names)

    def visit_Nonlocal(self, node: ast.Nonlocal) -> None:
        self.declared.update(node.names)

    def visit_Call(self, node: ast.Call) -> None:
        if isinstance(node.func, ast.Name) and node.func.id in _DYNAMIC_SCOPE:
            self.dynamic = True
        self.generic_visit(node)

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._nested(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._nested(node)

    def visit_Lambda(self, node: ast.Lambda) -> None:
        self._nested(node)

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        self._nested(node)

    def _nested(self, node: ast.AST) -> None:
        for child in ast.walk(node):
            if isinstance(child, ast.Name) and isinstance(child.ctx, ast.Load):
                self.captured.add(child.id)
