"""AST instrumentation for codewalk traces."""

import ast
import symtable
from dataclasses import dataclass
from typing import Literal

from codewalk.liveness import (
    function_scope,
    live_after_loops,
    loop_assigns,
    loop_state,
    statement_bindings,
    target_names,
)
from codewalk.locs import Loc, SourceMap

_BRACKETED = (
    ast.Attribute,
    ast.BinOp,
    ast.Call,
    ast.Compare,
    ast.Subscript,
    ast.UnaryOp,
)


@dataclass(frozen=True)
class StatementNames:
    """Names a statement binds itself, names whose changes it leaves out, and,
    on a loop, the only names whose changes it records."""

    binds: tuple[str, ...]
    quiet: tuple[str, ...]
    live: frozenset[str] | None = None


@dataclass(frozen=True)
class Instrumented:
    tree: ast.Module
    locs: list[Loc]
    watched: dict[int, tuple[str, ...]]
    inputs: dict[int, tuple[str, ...]]
    statements: dict[int, StatementNames]


def instrument(tree: ast.Module, source: str, source_name: str) -> Instrumented:
    transformer = _Instrumenter(source, source_name)
    module = transformer.module(tree)
    return Instrumented(
        module,
        transformer.locs,
        transformer.watched,
        transformer.inputs,
        transformer.statements,
    )


class _Instrumenter:
    def __init__(self, source: str, source_name: str) -> None:
        self.source = SourceMap(source)
        self.source_name = source_name
        self.scope = symtable.symtable(source, source_name, "exec")
        self.locs: list[Loc] = []
        self.watched: dict[int, tuple[str, ...]] = {}
        self.inputs: dict[int, tuple[str, ...]] = {}
        self.statements: dict[int, StatementNames] = {}
        self.live: dict[ast.stmt, frozenset[str]] = {}

    def module(self, node: ast.Module) -> ast.Module:
        start, end = self.source.module_range()
        module_loc = self._loc(
            "block", start, end, None, title=self.source_name, unit="module"
        )
        prefix_count = _module_prefix_length(node.body)
        prefix = node.body[:prefix_count]
        self.watched[module_loc] = _mentioned(node)
        self.live.update(live_after_loops(node.body, self.scope))
        body = self._body(node.body[prefix_count:], module_loc)
        wrapper = self._block_wrapper("block", module_loc, body, node)
        node.body = [*prefix, wrapper]
        ast.fix_missing_locations(node)
        return node

    def _body(self, statements: list[ast.stmt], block: int) -> list[ast.stmt]:
        result: list[ast.stmt] = []
        for statement in statements:
            result.extend(self._statement(statement, block))
        return result

    def _statement(self, node: ast.stmt, block: int) -> list[ast.stmt]:
        start, end = self.source.statement_range(node)
        statement = self._loc("stmt", start, end, block)
        marker = self._marker(statement, node)
        self._bind(statement, node, live=self.live.get(node))

        if isinstance(node, ast.FunctionDef):
            if _is_generator(node):
                return [marker, node]
            mentioned = _mentioned(node)
            self._definition_expressions(node, statement)
            block_start, block_end = self._function_range(node)
            function = self._loc(
                "block",
                block_start,
                block_end,
                statement,
                title=node.name,
                unit="call",
            )
            self.watched[function] = mentioned
            values = self._parameter_values(node.args, statement)
            scope = function_scope(self.scope, node)
            if scope is not None:
                self.live.update(live_after_loops(node.body, scope))
            doc, rest = _split_docstring(node.body)
            body = self._body(rest, function)
            node.body = [
                *doc,
                self._block_wrapper("block", function, [*values, *body], node),
            ]
        elif isinstance(node, ast.AsyncFunctionDef):
            pass
        elif isinstance(node, ast.ClassDef):
            node.decorator_list = [
                self._expression(item, statement) for item in node.decorator_list
            ]
            node.bases = [self._expression(item, statement) for item in node.bases]
            for keyword in node.keywords:
                keyword.value = self._expression(keyword.value, statement)
            doc, rest = _split_docstring(node.body)
            node.body = [*doc, *self._body(rest, block)]
        elif isinstance(node, ast.While):
            return [marker, *self._while(node, statement, block, (start, end))]
        elif isinstance(node, ast.For):
            mentioned = _mentioned(node)
            self._target(node.target, statement)
            values = self._target_values(node.target, statement)
            node.iter = self._expression(node.iter, statement)
            else_range = self.source.clause_range("else", node.body[-1])
            loop_start, loop_end = self.source.node_range(node)
            iteration = self._loc(
                "block",
                loop_start,
                loop_end,
                statement,
                title="iteration",
                unit="iteration",
            )
            self.watched[iteration] = mentioned
            node.body = [
                self._block_wrapper(
                    "iteration",
                    iteration,
                    [
                        *values,
                        *self._track(node, iteration),
                        *self._body(node.body, iteration),
                    ],
                    node,
                )
            ]
            node.orelse = self._clause_body(else_range, node.orelse, block)
        elif isinstance(node, ast.If):
            node.test = self._expression(node.test, statement)
            last = node.body[-1]
            node.body = self._body(node.body, block)
            node.orelse = self._clause_body(
                self.source.clause_range("else", last), node.orelse, block
            )
        elif isinstance(node, (ast.With, ast.AsyncWith)):
            for item in node.items:
                item.context_expr = self._expression(item.context_expr, statement)
                if item.optional_vars is not None:
                    self._target(item.optional_vars, statement)
            node.body = self._body(node.body, block)
        elif isinstance(node, (ast.Try, ast.TryStar)):
            before_else = (node.handlers[-1].body if node.handlers else node.body)[-1]
            else_range = self.source.clause_range("else", before_else)
            before_finally = (node.orelse or [before_else])[-1]
            finally_range = self.source.clause_range("finally", before_finally)
            node.body = self._body(node.body, block)
            for handler in node.handlers:
                handler.body = self._clause_body(
                    self.source.handler_range(handler),
                    handler.body,
                    block,
                    marker="caught",
                )
            node.orelse = self._clause_body(else_range, node.orelse, block)
            node.finalbody = self._clause_body(finally_range, node.finalbody, block)
        elif isinstance(node, ast.Match):
            node.subject = self._expression(node.subject, statement)
            for case in node.cases:
                if case.guard is not None:
                    case.guard = self._expression(case.guard, statement)
                case.body = self._clause_body(
                    self.source.case_range(case), case.body, block
                )
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                self._target(target, statement)
            node.value = self._expression(node.value, statement)
        elif isinstance(node, ast.AnnAssign):
            self._target(node.target, statement)
            if node.value is not None:
                node.value = self._expression(node.value, statement)
        elif isinstance(node, ast.AugAssign):
            self._target(node.target, statement)
            node.value = self._expression(node.value, statement)
        elif isinstance(node, ast.Delete):
            for target in node.targets:
                self._target(target, statement)
        elif isinstance(node, ast.Expr):
            node.value = self._expression(node.value, statement)
        elif isinstance(node, ast.Return):
            if node.value is not None:
                returned = _runtime_call(
                    "returned",
                    ast.Constant(statement),
                    self._expression(node.value, statement),
                )
                node.value = ast.copy_location(returned, node.value)
        elif isinstance(node, ast.Raise):
            if node.exc is not None:
                node.exc = self._expression(node.exc, statement)
            if node.cause is not None:
                node.cause = self._expression(node.cause, statement)
        elif isinstance(node, ast.Assert):
            node.test = self._expression(node.test, statement)
            if node.msg is not None:
                node.msg = self._expression(node.msg, statement)
        return [marker, node]

    def _while(
        self, node: ast.While, statement: int, block: int, header: tuple[int, int]
    ) -> list[ast.stmt]:
        loop_start, loop_end = self.source.node_range(node)
        iteration = self._loc(
            "block",
            loop_start,
            loop_end,
            statement,
            title="iteration",
            unit="iteration",
        )
        self.watched[iteration] = _mentioned(node)
        test = self._loc("stmt", *header, iteration)
        self._bind(test, node)
        leave: list[ast.stmt] = [ast.Break()]
        if node.orelse:
            leave.insert(0, ast.Expr(value=_runtime_call("mark_exhausted")))
        check = ast.If(
            test=ast.UnaryOp(op=ast.Not(), operand=self._expression(node.test, test)),
            body=leave,
            orelse=[],
        )
        body = [
            *self._track(node, iteration),
            self._marker(test, node),
            ast.copy_location(check, node),
            *self._body(node.body, iteration),
        ]
        orelse = self._clause_body(
            self.source.clause_range("else", node.body[-1]), node.orelse, block
        )
        node.test = ast.Constant(True)
        node.body = [self._block_wrapper("iteration", iteration, body, node)]
        node.orelse = []
        if not orelse:
            return [node]
        # `while True` never reaches its own `else`, so the runtime remembers
        # that the loop ended on a false test rather than on a `break`.
        after = ast.If(test=_runtime_call("take_exhausted"), body=orelse, orelse=[])
        return [node, ast.copy_location(after, node)]

    def _definition_expressions(self, node: ast.FunctionDef, parent: int) -> None:
        node.decorator_list = [
            self._expression(item, parent) for item in node.decorator_list
        ]
        node.args.defaults = [
            self._expression(item, parent) for item in node.args.defaults
        ]
        node.args.kw_defaults = [
            self._expression(item, parent) if item is not None else None
            for item in node.args.kw_defaults
        ]

    def _parameter_values(
        self, arguments: ast.arguments, parent: int
    ) -> list[ast.stmt]:
        parameters = [*arguments.posonlyargs, *arguments.args]
        if arguments.vararg is not None:
            parameters.append(arguments.vararg)
        parameters.extend(arguments.kwonlyargs)
        if arguments.kwarg is not None:
            parameters.append(arguments.kwarg)
        return [
            _value_statement(
                self._loc("expr", *self.source.argument_range(parameter), parent),
                parameter.arg,
                parameter,
            )
            for parameter in parameters
        ]

    def _clause_body(
        self,
        header: tuple[int, int] | None,
        statements: list[ast.stmt],
        block: int,
        *,
        marker: str = "stmt",
    ) -> list[ast.stmt]:
        body = self._body(statements, block)
        if header is None or not statements:
            return body
        clause = self._loc("stmt", *header, block)
        return [self._marker(clause, statements[0], marker), *body]

    def _bind(
        self, statement: int, node: ast.stmt, *, live: frozenset[str] | None = None
    ) -> None:
        binds = statement_bindings(node)
        quiet = target_names(node.target) if isinstance(node, ast.For) else []
        if binds or quiet or live is not None:
            self.statements[statement] = StatementNames(
                tuple(binds), tuple(quiet), live
            )

    def _track(self, node: ast.For | ast.While, iteration: int) -> list[ast.stmt]:
        inputs = loop_state(node)
        if not inputs:
            return []
        self.inputs[iteration] = tuple(inputs)
        assigns = loop_assigns(node)
        rebinds = [name for name in inputs if name in assigns]
        if rebinds:
            self.locs[iteration]["rebinds"] = rebinds
        call = ast.Expr(value=_runtime_call("state", ast.Constant(iteration)))
        return [ast.copy_location(call, node)]

    def _expression(self, node: ast.expr, parent: int) -> ast.expr:
        if isinstance(node, (ast.GeneratorExp, ast.Lambda)):
            return node
        bracket = isinstance(node, _BRACKETED) and (
            not hasattr(node, "ctx") or isinstance(node.ctx, ast.Load)
        )
        expression = parent
        if bracket:
            start, end = self.source.node_range(node)
            expression = self._loc("expr", start, end, parent)
        self._expression_fields(node, expression)
        if not bracket:
            return node
        wrapped = ast.Call(
            func=ast.Name(id="_cw_e", ctx=ast.Load()),
            args=[
                ast.Call(
                    func=ast.Name(id="_cw_b", ctx=ast.Load()),
                    args=[ast.Constant(expression)],
                    keywords=[],
                ),
                node,
            ],
            keywords=[],
        )
        return ast.copy_location(wrapped, node)

    def _expression_fields(self, node: ast.expr, parent: int) -> None:
        if isinstance(node, ast.Starred):
            node.value = self._expression(node.value, parent)
            return
        if isinstance(node, ast.NamedExpr):
            node.value = self._expression(node.value, parent)
            return
        if isinstance(node, (ast.ListComp, ast.SetComp, ast.GeneratorExp)):
            node.elt = self._expression(node.elt, parent)
            self._comprehensions(node.generators, parent)
            return
        if isinstance(node, ast.DictComp):
            node.key = self._expression(node.key, parent)
            node.value = self._expression(node.value, parent)
            self._comprehensions(node.generators, parent)
            return
        for field, value in ast.iter_fields(node):
            if field == "ctx":
                continue
            if isinstance(value, ast.expr):
                setattr(node, field, self._expression(value, parent))
            elif isinstance(value, list):
                for index, item in enumerate(value):
                    if isinstance(item, ast.expr):
                        value[index] = self._expression(item, parent)
                    elif isinstance(item, ast.keyword):
                        item.value = self._expression(item.value, parent)

    def _comprehensions(self, generators: list[ast.comprehension], parent: int) -> None:
        for generator in generators:
            self._target(generator.target, parent)
            generator.iter = self._expression(generator.iter, parent)
            generator.ifs = [self._expression(item, parent) for item in generator.ifs]

    def _target(self, node: ast.expr, parent: int) -> None:
        if isinstance(node, (ast.Tuple, ast.List)):
            for item in node.elts:
                self._target(item, parent)
        elif isinstance(node, ast.Starred):
            self._target(node.value, parent)
        elif isinstance(node, ast.Attribute):
            node.value = self._expression(node.value, parent)
        elif isinstance(node, ast.Subscript):
            node.value = self._expression(node.value, parent)
            node.slice = self._expression(node.slice, parent)

    def _target_values(self, node: ast.expr, parent: int) -> list[ast.stmt]:
        if isinstance(node, ast.Name):
            loc = self._loc("expr", *self.source.node_range(node), parent)
            return [_value_statement(loc, node.id, node)]
        if isinstance(node, (ast.Tuple, ast.List)):
            values: list[ast.stmt] = []
            for item in node.elts:
                values.extend(self._target_values(item, parent))
            return values
        if isinstance(node, ast.Starred):
            return self._target_values(node.value, parent)
        return []

    def _marker(self, loc: int, node: ast.stmt, method: str = "stmt") -> ast.stmt:
        marker = ast.Expr(value=_runtime_call(method, ast.Constant(loc)))
        return ast.copy_location(marker, node)

    def _block_wrapper(
        self, method: str, loc: int, body: list[ast.stmt], owner: ast.AST
    ) -> ast.With:
        call = _runtime_call(method, ast.Constant(loc))
        wrapper = ast.With(
            items=[ast.withitem(context_expr=call)], body=body or [ast.Pass()]
        )
        return ast.copy_location(wrapper, owner)

    def _function_range(self, node: ast.FunctionDef) -> tuple[int, int]:
        start, end = self.source.node_range(node)
        if node.decorator_list:
            decorator_start, _ = self.source.node_range(node.decorator_list[0])
            start = max(0, decorator_start - 1)
        return start, end

    def _loc(
        self,
        role: Literal["block", "stmt", "expr"],
        start: int,
        end: int,
        parent: int | None,
        *,
        title: str | None = None,
        unit: str | None = None,
    ) -> int:
        loc: Loc = {
            "role": role,
            "file": 0,
            "start": start,
            "end": end,
            "parent": parent,
        }
        if title is not None:
            loc["title"] = title
        if unit is not None:
            loc["unit"] = unit
        self.locs.append(loc)
        return len(self.locs) - 1


def _runtime_call(method: str, *args: ast.expr) -> ast.Call:
    return ast.Call(
        func=ast.Attribute(
            value=ast.Name(id="_cw", ctx=ast.Load()), attr=method, ctx=ast.Load()
        ),
        args=list(args),
        keywords=[],
    )


def _value_statement(loc: int, name: str, owner: ast.AST) -> ast.stmt:
    value = ast.Name(id=name, ctx=ast.Load())
    statement = ast.Expr(value=_runtime_call("value", ast.Constant(loc), value))
    return ast.copy_location(statement, owner)


def _split_docstring(body: list[ast.stmt]) -> tuple[list[ast.stmt], list[ast.stmt]]:
    count = 1 if body and _is_docstring(body[0]) else 0
    return body[:count], body[count:]


def _is_docstring(node: ast.stmt) -> bool:
    return (
        isinstance(node, ast.Expr)
        and isinstance(node.value, ast.Constant)
        and isinstance(node.value.value, str)
    )


def _module_prefix_length(body: list[ast.stmt]) -> int:
    index = 1 if body and _is_docstring(body[0]) else 0
    while index < len(body):
        node = body[index]
        if not isinstance(node, ast.ImportFrom) or node.module != "__future__":
            break
        index += 1
    return index


def _mentioned(node: ast.AST) -> tuple[str, ...]:
    names = [
        child for child in ast.walk(node) if isinstance(child, (ast.Name, ast.arg))
    ]
    names.sort(key=lambda child: (child.lineno, child.col_offset))
    return tuple(
        dict.fromkeys(
            child.id if isinstance(child, ast.Name) else child.arg for child in names
        )
    )


def _is_generator(node: ast.FunctionDef) -> bool:
    class YieldFinder(ast.NodeVisitor):
        found = False

        def visit_Yield(self, node: ast.Yield) -> None:
            self.found = True

        def visit_YieldFrom(self, node: ast.YieldFrom) -> None:
            self.found = True

        def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
            pass

        def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
            pass

        def visit_Lambda(self, node: ast.Lambda) -> None:
            pass

    finder = YieldFinder()
    for statement in node.body:
        finder.visit(statement)
    return finder.found
