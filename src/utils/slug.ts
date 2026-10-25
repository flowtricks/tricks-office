/** Creates field-name slugs. Used by Choice, Input, Range, Select, and Textarea. */
export function slug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
