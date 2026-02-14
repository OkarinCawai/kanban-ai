import { z, type ZodType } from "zod";

const richTextMarkTypeSchema = z.enum(["bold", "italic", "strike", "code"]);

export const richTextMarkSchema = z
  .object({
    type: richTextMarkTypeSchema,
    attrs: z.record(z.unknown()).optional()
  })
  .strict();

export type RichTextMark = z.infer<typeof richTextMarkSchema>;

const richTextNodeTypeSchema = z.enum([
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "codeBlock",
  "blockquote",
  "hardBreak",
  "horizontalRule"
]);

export type RichTextNode = {
  type: z.infer<typeof richTextNodeTypeSchema>;
  attrs?: Record<string, unknown>;
  marks?: RichTextMark[];
  text?: string;
  content?: RichTextNode[];
};

export const richTextNodeSchema: ZodType<RichTextNode> = z.lazy(() =>
  z
    .object({
      type: richTextNodeTypeSchema,
      attrs: z.record(z.unknown()).optional(),
      marks: z.array(richTextMarkSchema).max(50).optional(),
      text: z.string().max(20_000).optional(),
      content: z.array(richTextNodeSchema).max(5_000).optional()
    })
    .strict()
    .superRefine((value, ctx) => {
      if (value.type === "text") {
        if (typeof value.text !== "string") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Rich text 'text' nodes must include a text string.",
            path: ["text"]
          });
        }
        if (value.content && value.content.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Rich text 'text' nodes must not include nested content.",
            path: ["content"]
          });
        }
      }
    })
);

export const richTextDocSchema = z
  .object({
    type: z.literal("doc"),
    content: z.array(richTextNodeSchema).max(5_000).optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    let size = 0;
    try {
      size = JSON.stringify(value).length;
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Rich text document must be JSON serializable."
      });
      return;
    }

    if (size > 80_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Rich text document is too large."
      });
    }
  });

export type RichTextDoc = z.infer<typeof richTextDocSchema>;

