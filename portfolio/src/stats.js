// Shared, mutable readouts written by the background's render loop and read by the HUD.
// Kept outside React so 60fps updates don't trigger re-renders.
export const stats = { fps: 0, x: 0.5, y: 0.5, time: 0 };
