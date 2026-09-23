"""AST instrumentation for codewalk traces."""

import ast
from dataclasses import dataclass
from typing import Literal

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
class Instrumented:
    tree: ast.Module
    locs: list[Loc]


def instrument(
    tree: ast.Module, source: str, source_name: str = "main.py"
) -> Instrumented:
    transformer = _Instrumenter(source, source_name)
    return Instrumented(transformer.module(tree), transformer.locs)


class _Instrumenter:
    def __init__(self, source: str, source_name: str) -> None:
        self.source = SourceMap(source)
        self.source_name = source_name
        self.locs: list[Loc] = []

    def module(self, node: ast.Module) -> ast.Module:
        start, end = self.source.module_range()
        module_loc = self._loc(
            "block", start, end, None, title=self.source_name, unit="module"
        )
        prefix_count = _module_prefix_length(node.body)
        prefix = node.body[:prefix_count]
        body = self._body(node.body[prefix_count:], module_loc)
        wrapper = self._block_wrapper("block", module_loc, body, node)
        node.body = [*prefix, wrapper]
        ast.fix_missing_locations(node)
        return node

    def _body(
        self, statements: list[ast.stmt], block: int, *, docstring: bool = False
    ) -> list[ast.stmt]:
        result: list[ast.stmt] = []
        index = 0
        if docstring and statements and _is_docstring(statements[0]):
            result.append(statements[0])
            index = 1
        for statement in statements[index:]:
            result.extend(self._statement(statement, block))
        return result

    def _statement(self, node: ast.stmt, block: int) -> list[ast.stmt]:
        start, end = self.source.statement_range(node)
        statement = self._loc("stmt", start, end, block)
        marker = self._marker(statement, node)

        if isinstance(node, ast.FunctionDef):
            if _is_generator(node):
                return [marker, node]
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
            entries = self._parameter_entries(node.args, statement)
            doc = node.body[:1] if node.body and _is_docstring(node.body[0]) else []
            body = self._body(node.body[len(doc) :], function)
            node.body = [
                *doc,
                self._block_wrapper("block", function, body, node, entries),
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
            node.body = self._body(node.body, block, docstring=True)
        elif isinstance(node, ast.While):
            return [marker, *self._while(node, statement, block, (start, end))]
        elif isinstance(node, ast.For):
            self._target(node.target, statement)
            entries = self._target_entries(node.target, statement)
            node.iter = self._expression(node.iter, statement)
            loop_start, loop_end = self.source.node_range(node)
            iteration = self._loc(
                "block",
                loop_start,
                loop_end,
                statement,
                title="iteration",
                unit="iteration",
            )
            node.body = [
                self._block_wrapper(
                    "iteration",
                    iteration,
                    self._body(node.body, iteration),
                    node,
                    entries,
                )
            ]
            node.orelse = self._body(node.orelse, block)
        elif isinstance(node, ast.If):
            node.test = self._expression(node.test, statement)
            node.body = self._body(node.body, block)
            node.orelse = self._body(node.orelse, block)
        elif isinstance(node, (ast.With, ast.AsyncWith)):
            for item in node.items:
                item.context_expr = self._expression(item.context_expr, statement)
                if item.optional_vars is not None:
                    self._target(item.optional_vars, statement)
            node.body = self._body(node.body, block)
        elif isinstance(node, (ast.Try, ast.TryStar)):
            node.body = self._body(node.body, block)
            for handler in node.handlers:
                if handler.type is not None:
                    handler.type = self._expression(handler.type, statement)
                handler.body = self._body(handler.body, block)
            node.orelse = self._body(node.orelse, block)
            node.finalbody = self._body(node.finalbody, block)
        elif isinstance(node, ast.Match):
            node.subject = self._expression(node.subject, statement)
            for case in node.cases:
                if case.guard is not None:
                    case.guard = self._expression(case.guard, statement)
                case.body = self._body(case.body, block)
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
                node.value = self._expression(node.value, statement)
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
        test = self._loc("stmt", *header, iteration)
        leave: list[ast.stmt] = [ast.Break()]
        if node.orelse:
            leave.insert(0, ast.Expr(value=_runtime_call("mark_exhausted")))
        check = ast.If(
            test=ast.UnaryOp(op=ast.Not(), operand=self._expression(node.test, test)),
            body=leave,
            orelse=[],
        )
        body = [
            self._marker(test, node),
            ast.copy_location(check, node),
            *self._body(node.body, iteration),
        ]
        orelse = self._body(node.orelse, block)
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

    def _parameter_entries(
        self, arguments: ast.arguments, parent: int
    ) -> list[ast.expr]:
        parameters = [*arguments.posonlyargs, *arguments.args]
        if arguments.vararg is not None:
            parameters.append(arguments.vararg)
        parameters.extend(arguments.kwonlyargs)
        if arguments.kwarg is not None:
            parameters.append(arguments.kwarg)
        entries: list[ast.expr] = []
        for parameter in parameters:
            loc = self._loc("expr", *self.source.argument_range(parameter), parent)
            value = ast.copy_location(
                ast.Name(id=parameter.arg, ctx=ast.Load()), parameter
            )
            entries.append(_value_entry(loc, value))
        return entries

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

    def _target_entries(self, node: ast.expr, parent: int) -> list[ast.expr]:
        if isinstance(node, ast.Name):
            loc = self._loc("expr", *self.source.node_range(node), parent)
            value = ast.copy_location(ast.Name(id=node.id, ctx=ast.Load()), node)
            return [_value_entry(loc, value)]
        if isinstance(node, (ast.Tuple, ast.List)):
            entries: list[ast.expr] = []
            for item in node.elts:
                entries.extend(self._target_entries(item, parent))
            return entries
        if isinstance(node, ast.Starred):
            return self._target_entries(node.value, parent)
        return []

    def _marker(self, loc: int, node: ast.stmt) -> ast.stmt:
        marker = ast.Expr(value=_runtime_call("stmt", ast.Constant(loc)))
        return ast.copy_location(marker, node)

    def _block_wrapper(
        self,
        method: str,
        loc: int,
        body: list[ast.stmt],
        owner: ast.AST,
        entries: list[ast.expr] | None = None,
    ) -> ast.With:
        call = _runtime_call(method, ast.Constant(loc), *(entries or []))
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


def _value_entry(loc: int, value: ast.expr) -> ast.Tuple:
    return ast.Tuple(elts=[ast.Constant(loc), value], ctx=ast.Load())


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
