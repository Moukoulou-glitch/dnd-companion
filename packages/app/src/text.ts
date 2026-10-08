/** No summary (a book entry): the start of its text, cut at a sentence. */
export function shortText(text: string[] | undefined): string {
  const first = (text ?? []).find((t) => !/^(Prerequisite|Source|•)/i.test(t)) ?? "";
  if (first.length <= 160) return first;
  const cut = first.slice(0, 160);
  const end = cut.lastIndexOf(". ");
  return end > 60 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

