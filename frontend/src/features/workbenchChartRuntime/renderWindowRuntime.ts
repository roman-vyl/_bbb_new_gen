export type RenderWindowRuntimeBoundary = {
  implemented: false;
  revision: number;
  shiftSeq: number;
  bounds: { startIndex: number; endIndex: number } | null;
};

export function createRenderWindowRuntimeBoundary(): RenderWindowRuntimeBoundary {
  return {
    implemented: false,
    revision: 0,
    shiftSeq: 0,
    bounds: null,
  };
}
