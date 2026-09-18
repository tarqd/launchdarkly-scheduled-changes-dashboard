/**
 * Chart colours.
 *
 * Both series are steps from the LaunchPad ramps, chosen so the pair passes the
 * full palette check (lightness band, chroma floor, CVD separation, normal-vision
 * floor, contrast vs surface) in light *and* dark mode:
 *
 *   light  blue-600 #3144d9 + yellow-700 #997000  -> all checks pass on #ffffff
 *   dark   blue-400 #7084ff + yellow-700 #997000  -> all checks pass on #181a1f
 *
 * Dark mode is a deliberate re-step from the same ramps, not an automatic flip.
 * Series identity is always backed by a legend plus a text label, never colour
 * alone. Status (conflict, approval state) uses LaunchPad's reserved status
 * colours with an icon and a word, and never borrows a series hue.
 */

export const SERIES = {
  /** Scheduled changes that will simply execute. */
  scheduled: { light: '#3144d9', dark: '#7084ff', label: 'Scheduled' },
  /** Scheduled changes still waiting on an approval. */
  awaitingApproval: { light: '#997000', dark: '#997000', label: 'Awaiting approval' },
} as const;

export type SeriesKey = keyof typeof SERIES;

/** CSS custom properties, so a theme switch repaints without re-rendering. */
export const SERIES_VAR: Record<SeriesKey, string> = {
  scheduled: 'var(--viz-scheduled)',
  awaitingApproval: 'var(--viz-awaiting-approval)',
};
