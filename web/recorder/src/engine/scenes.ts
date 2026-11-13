// Scene layouts. Every box is in stage fractions (0..1 of width / height),
// so the same numbers drive the 1920x1080 recording and the DOM thumbnails.

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
}

export type CardKind = 'problem' | 'brb' | 'outro';

export interface Layout {
  screen: Box;
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

function layout(p: Partial<Layout>): Layout {
  return { screen: off(FULL), camera: off(BUBBLE), card: null, title: false, lower: false, ...p };
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
  { id: 7, name: 'Try this', layout: layout({ card: 'problem', camera: bubble(0.8, 0.64, 0.16) }) },
  { id: 8, name: 'Be right back', layout: layout({ card: 'brb' }) },
  { id: 9, name: 'Outro', layout: layout({ card: 'outro', camera: { ...bubble(0.08, 0.22, 0.31), ring: false } }) },
];

export const sceneById = (id: number): SceneDef => SCENES.find((s) => s.id === id) ?? SCENES[1];

/** Scenes that show the shared screen. */
export const showsScreen = (id: number): boolean => sceneById(id).layout.screen.o > 0;
