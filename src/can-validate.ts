/**
 * Whether an item carries the minimum metadata to attempt validation:
 * a strong identifier (DOI / ISBN / PMID in extra) or a title plus at least
 * one creator. Used to gate the validate menu items and collection runs.
 */
export function canValidateItem(item: any): boolean {
  const hasStrongId =
    item.getField("DOI") ||
    item.getField("ISBN") ||
    item.getField("extra")?.includes("PMID");
  const hasTitleAndAuthor =
    item.getField("title") && item.getCreators().length > 0;
  return Boolean(hasStrongId || hasTitleAndAuthor);
}
