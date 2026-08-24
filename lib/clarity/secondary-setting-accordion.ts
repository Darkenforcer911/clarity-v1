export function resolveSecondarySettingExpansion<TSection extends string>(
  current: TSection | null,
  requested: TSection,
  expanded: boolean,
): TSection | null {
  if (expanded) return requested;
  return current === requested ? null : current;
}
