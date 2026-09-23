import { z } from "zod";

export const TRACE_FORMAT_VERSION = 1;

const RoleSchema = z.enum(["block", "stmt", "expr"]);

const BlockLocSchema = z
  .object({
    role: z.literal("block"),
    title: z.string(),
    unit: z.string(),
    file: z.number().int().nonnegative(),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    parent: z.number().int().nonnegative().nullable(),
  })
  .strict();

const NonBlockLocSchema = z
  .object({
    role: z.enum(["stmt", "expr"]),
    file: z.number().int().nonnegative(),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    parent: z.number().int().nonnegative().nullable(),
  })
  .strict();

const LocSchema = z.discriminatedUnion("role", [
  BlockLocSchema,
  NonBlockLocSchema,
]);

const SourceSchema = z
  .object({
    file: z.string(),
    text: z.string(),
  })
  .strict();

export const HeaderSchema = z
  .object({
    codewalk: z.literal(TRACE_FORMAT_VERSION),
    sources: z.array(SourceSchema),
    locs: z.array(LocSchema),
  })
  .strict();

const OkEndSchema = z.object({ status: z.literal("ok") }).strict();

const TruncatedEndSchema = z
  .object({ status: z.literal("truncated") })
  .strict();

const TimeoutEndSchema = z.object({ status: z.literal("timeout") }).strict();

const ExceptionEndSchema = z
  .object({
    status: z.literal("exception"),
    traceback: z.string(),
  })
  .strict();

const SyntaxErrorEndSchema = z
  .object({
    status: z.literal("syntax_error"),
    message: z.string(),
    file: z.number().int().nonnegative(),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  })
  .strict();

const EndSchema = z.discriminatedUnion("status", [
  OkEndSchema,
  TruncatedEndSchema,
  TimeoutEndSchema,
  ExceptionEndSchema,
  SyntaxErrorEndSchema,
]);

const EnterEventSchema = z
  .object({
    op: z.literal("enter"),
    loc: z.number().int().nonnegative(),
  })
  .strict();

const ExitEventSchema = z
  .object({
    op: z.literal("exit"),
    exc: z.string().optional(),
  })
  .strict();

const OutEventSchema = z
  .object({
    op: z.literal("out"),
    stream: z.enum(["stdout", "stderr"]),
    text: z.string(),
  })
  .strict();

const ValueEventSchema = z
  .object({
    op: z.literal("value"),
    loc: z.number().int().nonnegative(),
    text: z.string(),
  })
  .strict();

const EndEventSchema = z.discriminatedUnion("status", [
  OkEndSchema.extend({ op: z.literal("end") }),
  TruncatedEndSchema.extend({ op: z.literal("end") }),
  TimeoutEndSchema.extend({ op: z.literal("end") }),
  ExceptionEndSchema.extend({ op: z.literal("end") }),
  SyntaxErrorEndSchema.extend({ op: z.literal("end") }),
]);

export const EventSchema = z.union([
  EnterEventSchema,
  ExitEventSchema,
  OutEventSchema,
  ValueEventSchema,
  EndEventSchema,
]);

export type LocId = number;

export type NodeId = number;

export type Role = z.infer<typeof RoleSchema>;

export function isBlockRole(role: Role | undefined): boolean {
  return role === "block";
}

export type Loc = z.infer<typeof LocSchema>;

export type Source = z.infer<typeof SourceSchema>;

export type Header = z.infer<typeof HeaderSchema>;

export type End = z.infer<typeof EndSchema>;

export type TraceEvent = z.infer<typeof EventSchema>;
