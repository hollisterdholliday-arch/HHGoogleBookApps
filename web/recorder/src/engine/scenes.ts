// Scene layouts. Every box is in stage fractions (0..1 of width / height),
// so the same numbers drive the 1920x1080 recording and the DOM thumbnails.

import type { CustomScene, Shape } from './custom';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius as a fraction of stage width. Ignored when `circle`. */
  r: number;
  circle?: boolean;
  /** 0..1 */
  o: number;
  /** White ring around the box (camera bubbles). */
  ring?: boolean;
  /** Camera only: background removed, no frame, person floats over the scene. */
  cutout?: boolean;
  /** Custom scenes: outline shape, roundness (0..1), border and shadow. */
  shape?: Shape;
  round?: number;
  border?: number;
  borderColor?: string;
  noShadow?: boolean;
}

export type CardKind = 'problem' | 'brb' | 'outro';

export interface Layout {
  screen: Box;
  /** Second shared screen or window. */
  screen2: Box;
  /** A teaching tool (HTML file or link) running inside the recorder. */
  tool: Box;
  camera: Box;
  card: CardKind | null;
  title: boolean;
  lower: boolean;
}

export interface SceneDef {
  id: number;
  name: string;
  layout: Layout;
}

const FULL: Box = { x: 0, y: 0, w: 1, h: 1, r: 0, o: 1 };
const off = (b: Box): Box => ({ ...b, o: 0 });
// A circle on a 16:9 stage: height fraction = width fraction * 16/9.
const bubble = (x: number, y: number, w: number): Box => ({ x, y, w, h: (w * 16) / 9, r: 0, circle: true, o: 1, ring: true });
const BUBBLE = bubble(0.78, 0.62, 0.185);
const LEFT_HALF: Box = { x: 0.015, y: 0.2, w: 0.48, h: 0.48, r: 0.016, o: 1 };
const RIGHT_HALF: Box = { x: 0.505, y: 0.2, w: 0.48, h: 0.48, r: 0.016, o: 1 };

function layout(p: Partial<Layout>): Layout {
  return { screen: off(FULL), screen2: off(RIGHT_HALF), tool: off(FULL), camera: off(BUBBLE), card: null, title: false, lower: false, ...p };
}

export const SCENES: SceneDef[] = [
  { id: 1, name: 'Welcome', layout: layout({ camera: FULL, title: true }) },
  { id: 2, name: 'Lesson', layout: layout({ screen: FULL, camera: BUBBLE }) },
  {
    id: 3,
    name: 'Side by side',
    layout: layout({
      screen: { x: 0.025, y: 0.18, w: 0.64, h: 0.64, r: 0.02, o: 1 },
      camera: { x: 0.685, y: 0.18, w: 0.29, h: 0.64, r: 0.02, o: 1 },
    }),
  },
  { id: 4, name: 'Just me', layout: layout({ camera: FULL, lower: true }) },
  { id: 5, name: 'Screen only', layout: layout({ screen: FULL }) },
  {
    id: 6,
    name: 'Presenter',
    layout: layout({ screen: FULL, camera: { x: 0.6, y: 0.16, w: 0.42, h: 0.84, r: 0, o: 1, cutout: true }, lower: true }),
  },
  {
    id: 7,
    name: 'Tool + me',
    layout: layout({
      tool: { x: 0.02, y: 0.036, w: 0.72, h: 0.928, r: 0.02, o: 1 },
      camera: { x: 0.76, y: 0.036, w: 0.22, h: 0.39, r: 0.02, o: 1 },
    }),
  },
  {
    id: 8,
    name: 'Two screens',
    layout: layout({ screen: LEFT_HALF, screen2: RIGHT_HALF, camera: bubble(0.445, 0.75, 0.11) }),
  },
  { id: 9, name: 'Try this', layout: layout({ card: 'problem', camera: bubble(0.8, 0.64, 0.16) }) },
  { id: 10, name: 'Be right back', layout: layout({ card: 'brb' }) },
  { id: 11, name: 'Outro', layout: layout({ card: 'outro', camera: { ...bubble(0.08, 0.22, 0.31), ring: false } }) },
];

export const sceneById = (id: number): SceneDef => SCENES.find((s) => s.id === id) ?? SCENES[1];

/** Scenes that show the shared screen. */
export const showsScreen = (id: number): boolean => sceneById(id).layout.screen.o > 0;

/** The camera/screen/tool boxes of a custom scene, so switching to and from
 * it animates like any other scene. Other layers are drawn separately. */
export function customLayout(c: CustomScene): Layout {
  const slot = (type: string, fallback: Box): Box => {
    const l = c.layers.find((x) => x.type === type);
    if (!l) return off(fallback);
    return {
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
      r: 0,
      o: l.hidden ? 0 : l.opacity,
      shape: l.shape,
      round: l.round,
      border: l.border,
      borderColor: l.borderColor,
      noShadow: !l.shadow,
      cutout: type === 'camera' && !!l.cutout,
      ring: l.border > 0,
    };
  };
  return {
    screen: slot('screen', FULL),
    screen2: slot('screen2', RIGHT_HALF),
    tool: slot('tool', FULL),
    camera: slot('camera', BUBBLE),
    card: null,
    title: false,
    lower: false,
  };
}
