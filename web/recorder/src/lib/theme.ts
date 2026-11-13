// Material You dynamic color: the whole app re-colors itself from one
// accent color, using Google's material-color-utilities (Apache-2.0).

import { argbFromHex, hexFromArgb, Hct, MaterialDynamicColors as M, SchemeTonalSpot } from '@material/material-color-utilities';

export const SEEDS = [
  { name: 'Indigo', hex: '#4a55a8' },
  { name: 'Teal', hex: '#006a65' },
  { name: 'Rose', hex: '#9a405e' },
  { name: 'Amber', hex: '#8b5000' },
  { name: 'Green', hex: '#2a6b2a' },
  { name: 'Violet', hex: '#6750a4' },
];

const TOKENS: [string, keyof typeof M][] = [
  ['--primary', 'primary'],
  ['--on-primary', 'onPrimary'],
  ['--prim-cont', 'primaryContainer'],
  ['--on-prim-cont', 'onPrimaryContainer'],
  ['--sec-cont', 'secondaryContainer'],
  ['--on-sec-cont', 'onSecondaryContainer'],
  ['--bg', 'surface'],
  ['--on', 'onSurface'],
  ['--on-var', 'onSurfaceVariant'],
  ['--outline-var', 'outlineVariant'],
  ['--inverse', 'inverseSurface'],
  ['--on-inverse', 'inverseOnSurface'],
  ['--inverse-primary', 'inversePrimary'],
];

/** Apply the accent color to every themed surface of `doc` (also used for the mini window). */
export function applyAccent(seed: string, dark: boolean, docs: Document[]): void {
  let scheme: SchemeTonalSpot;
  try {
    scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seed)), dark, 0);
  } catch {
    return;
  }
  const vals = TOKENS.map(([v, k]) => [v, hexFromArgb((M[k] as unknown as { getArgb(s: unknown): number }).getArgb(scheme))] as const);
  const btnOn = dark ? vals.find(([v]) => v === '--on-prim-cont')![1] : vals.find(([v]) => v === '--primary')![1];
  const onBtnOn = dark ? vals.find(([v]) => v === '--prim-cont')![1] : vals.find(([v]) => v === '--on-primary')![1];
  for (const d of docs) {
    const st = d.documentElement.style;
    for (const [v, c] of vals) st.setProperty(v, c);
    st.setProperty('--btn-on', btnOn);
    st.setProperty('--on-btn-on', onBtnOn);
    d.querySelector('meta[name="theme-color"]')?.setAttribute('content', vals.find(([v]) => v === '--bg')![1]);
  }
}
