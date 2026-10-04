import { isValidEditRegion, type EditRegion } from '@open-industrial-design/design-model';

/** Binary pixel-center raster shared by request masking and outside-selection protection. */
export function rasterEditSelection(region: EditRegion, width: number, height: number): Uint8Array {
  if (
    !isValidEditRegion(region) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 16_777_216
  )
    throw new Error('Invalid mask dimensions or selection.');
  const output = new Uint8Array(width * height);
  const shape = region.shape;
  if (!shape) {
    const left = Math.floor(region.x * width),
      right = Math.min(width, Math.ceil((region.x + region.width) * width));
    for (
      let y = Math.floor(region.y * height);
      y < Math.min(height, Math.ceil((region.y + region.height) * height));
      y++
    )
      output.fill(1, y * width + left, y * width + right);
  } else if (shape.kind === 'polygon') {
    const points = shape.points.map(([x, y]) => [x * width, y * height]);
    for (let row = 0; row < height; row++) {
      const y = row + 0.5,
        intersections: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i],
          [bx, by] = points[(i + 1) % points.length];
        if (ay > y !== by > y) intersections.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i + 1 < intersections.length; i += 2) {
        const left = Math.max(0, Math.ceil(intersections[i] - 0.5)),
          right = Math.min(width, Math.ceil(intersections[i + 1] - 0.5));
        output.fill(1, row * width + left, row * width + right);
      }
    }
  } else {
    let work = 0;
    for (const stroke of shape.strokes) {
      const radius = stroke.radius * Math.min(width, height);
      const points = stroke.points.map(([x, y]) => [x * width, y * height]);
      for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i],
          [bx, by] = points[Math.min(i + 1, points.length - 1)];
        const dx = bx - ax,
          dy = by - ay,
          length = dx * dx + dy * dy;
        work += (Math.abs(dx) + 2 * radius + 2) * (Math.abs(dy) + 2 * radius + 2);
        if (work > 64_000_000)
          throw new Error('Selection is too complex. Simplify the brush strokes.');
        for (
          let y = Math.max(0, Math.floor(Math.min(ay, by) - radius));
          y < Math.min(height, Math.ceil(Math.max(ay, by) + radius));
          y++
        )
          for (
            let x = Math.max(0, Math.floor(Math.min(ax, bx) - radius));
            x < Math.min(width, Math.ceil(Math.max(ax, bx) + radius));
            x++
          ) {
            const t = length
              ? Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / length))
              : 0;
            if ((x + 0.5 - ax - t * dx) ** 2 + (y + 0.5 - ay - t * dy) ** 2 <= radius * radius)
              output[y * width + x] = 1;
          }
      }
    }
  }
  return output;
}
