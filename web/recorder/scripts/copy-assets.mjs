// Copies MediaPipe's WebAssembly runtime into public/ so the app serves it
// itself (works offline, no CDN). Runs before dev and build.
import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('public/mediapipe', { recursive: true });
cpSync('node_modules/@mediapipe/tasks-vision/wasm', 'public/mediapipe', { recursive: true });
