/* eslint-disable */
declare module "three" {
  export class WebGLRenderer {
    constructor(opts?: any);
    capabilities: { isWebGL2: boolean };
    setClearColor(color: number, alpha: number): void;
    setSize(w: number, h: number): void;
    setPixelRatio(r: number): void;
    render(scene: any, camera: any): void;
    dispose(): void;
    domElement: HTMLCanvasElement;
  }
  export class Scene {
    add(obj: any): void;
  }
  export class OrthographicCamera {
    constructor(l: number, r: number, t: number, b: number, n: number, f: number);
    position: { z: number };
  }
  export class ShaderMaterial {
    constructor(opts: any);
    dispose(): void;
  }
  export class Mesh {
    constructor(geo: any, mat: any);
  }
  export class PlaneGeometry {
    constructor(w: number, h: number);
  }
  export class Vector2 {
    constructor(x?: number, y?: number);
    set(x: number, y: number): void;
  }
  export class Color {
    constructor();
    set(hex: string): void;
  }
}
