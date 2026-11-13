// PDF slides (PowerPoint, Google Slides or Keynote saved as PDF), rendered
// with Mozilla's pdf.js (Apache-2.0). Pages are drawn to a canvas that takes
// the place of the screen share in your scenes.

import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const RENDER_W = 1920;

export class Slides {
  name = '';
  page = 1;
  pages = 0;
  readonly canvas = document.createElement('canvas');
  private doc: PDFDocumentProxy | null = null;
  private task: PDFDocumentLoadingTask | null = null;
  private cache = new Map<number, HTMLCanvasElement>();
  private rendering = new Map<number, Promise<HTMLCanvasElement>>();
  onChange: () => void = () => {};

  get active(): boolean {
    return !!this.doc;
  }

  async open(file: File): Promise<void> {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const doc = await task.promise;
    this.close();
    this.task = task;
    this.doc = doc;
    this.name = file.name;
    this.pages = doc.numPages;
    await this.go(1);
  }

  close(): void {
    void this.task?.destroy();
    this.task = null;
    this.doc = null;
    this.cache.clear();
    this.rendering.clear();
    this.name = '';
    this.pages = 0;
    this.page = 1;
    this.onChange();
  }

  private render(n: number): Promise<HTMLCanvasElement> {
    const hit = this.cache.get(n);
    if (hit) return Promise.resolve(hit);
    const busy = this.rendering.get(n);
    if (busy) return busy;
    const doc = this.doc!;
    const p = (async () => {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: RENDER_W / base.width });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      await page.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise;
      this.cache.set(n, c);
      if (this.cache.size > 6) this.cache.delete([...this.cache.keys()].find((k) => Math.abs(k - this.page) > 2) ?? n);
      this.rendering.delete(n);
      return c;
    })();
    this.rendering.set(n, p);
    return p;
  }

  async go(n: number): Promise<void> {
    if (!this.doc) return;
    const target = Math.max(1, Math.min(this.pages, n));
    const c = await this.render(target);
    this.page = target;
    this.canvas.width = c.width;
    this.canvas.height = c.height;
    this.canvas.getContext('2d')!.drawImage(c, 0, 0);
    this.onChange();
    // Get the next slide ready so flipping is instant.
    if (target < this.pages) void this.render(target + 1);
  }

  next = () => this.go(this.page + 1);
  prev = () => this.go(this.page - 1);
}
