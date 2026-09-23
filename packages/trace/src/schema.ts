import { z } from "zod";

const TRACE_FORMAT_VERSION = 3;

const RoleSchema = z.enum(["block", "stmt", "expr"]);

const BlockLocSchema = z
  .object({
    role: z.literal("block"),
    title: z.string(),
    unit: z.string(),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    parent: z.number().int().nonnegative().nullable(),
    rebinds: z.array(z.string()).optional(),
  })
  .strict();

const NonBlockLocSchema = z
  .object({
    role: z.enum(["stmt", "expr"]),
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
    source: SourceSchema,
    literals: z.record(z.string(), z.tuple([z.string(), z.string()])),
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

const LengthSchema = z.number().int().nonnegative().optional();

const PrimitiveSchema = z
  .object({
    kind: z.enum(["number", "string", "boolean", "null"]),
    text: z.string(),
    length: LengthSchema,
  })
  .strict();

const ReferenceSchema = z
  .object({ ref: z.number().int().nonnegative() })
  .strict();

const ValueSchema = z.union([PrimitiveSchema, ReferenceSchema]);

const SequenceSchema = z
  .object({
    kind: z.literal("sequence"),
    type: z.string(),
    text: z.string().optional(),
    items: z.array(ValueSchema),
    length: LengthSchema,
  })
  .strict();

const SetSchema = z
  .object({
    kind: z.literal("set"),
    type: z.string(),
    text: z.string().optional(),
    items: z.array(ValueSchema),
    length: LengthSchema,
  })
  .strict();

const MappingSchema = z
  .object({
    kind: z.literal("mapping"),
    type: z.string(),
    text: z.string().optional(),
    entries: z.array(z.tuple([ValueSchema, ValueSchema])),
    length: LengthSchema,
  })
  .strict();

const RecordSchema = z
  .object({
    kind: z.literal("record"),
    type: z.string(),
    text: z.string().optional(),
    fields: z.array(z.tuple([z.string(), ValueSchema])),
    length: LengthSchema,
  })
  .strict();

const OpaqueSchema = z
  .object({
    kind: z.literal("opaque"),
    type: z.string(),
    text: z.string(),
  })
  .strict();

const HeapObjectSchema = z.discriminatedUnion("kind", [
  SequenceSchema,
  SetSchema,
  MappingSchema,
  RecordSchema,
  OpaqueSchema,
]);

const objectEventFields = {
  op: z.literal("obj"),
  id: z.number().int().nonnegative(),
};

const ObjectEventSchema = z.discriminatedUnion("kind", [
  SequenceSchema.extend(objectEventFields),
  SetSchema.extend(objectEventFields),
  MappingSchema.extend(objectEventFields),
  RecordSchema.extend(objectEventFields),
  OpaqueSchema.extend(objectEventFields),
]);

const AnchoredValueEventSchema = z
  .object({
    op: z.literal("value"),
    loc: z.number().int().nonnegative(),
    value: ValueSchema,
  })
  .strict();

const NamedValueEventSchema = z
  .object({
    op: z.literal("value"),
    name: z.string(),
    value: ValueSchema,
    literal: z.literal(true).optional(),
  })
  .strict();

const ReturnEventSchema = z
  .object({
    op: z.literal("return"),
    value: ValueSchema,
    literal: z.literal(true).optional(),
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
  AnchoredValueEventSchema,
  NamedValueEventSchema,
  ReturnEventSchema,
  ObjectEventSchema,
  EndEventSchema,
]);

export type LocId = number;

export type NodeId = number;

export type ObjectId = number;

export type Value = z.infer<typeof ValueSchema>;

export type HeapObject = z.infer<typeof HeapObjectSchema>;

export type Role = z.infer<typeof RoleSchema>;

export type Loc = z.infer<typeof LocSchema>;

export type Header = z.infer<typeof HeaderSchema>;

export type End = z.infer<typeof EndSchema>;

export type TraceEvent = z.infer<typeof EventSchema>;
