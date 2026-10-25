let count = 0;

/** Creates stable page IDs. Used by Accordion. */
export function uid(prefix: string): string {
  return `${prefix}-${++count}`;
}
