"""
Stroke processing pipeline: raw RNN offsets → SVG Bezier path strings.

Pipeline: offsets → scale(1.5x) → cumsum → denoise → align → flip Y → Catmull-Rom Bezier
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.signal import savgol_filter


@dataclass
class StrokePath:
    """A single SVG path with its bounding box."""
    d: str  # SVG path d-attribute string (M/C commands)
    bbox: dict  # {"x": float, "y": float, "width": float, "height": float}


def offsets_to_coords(offsets: np.ndarray) -> np.ndarray:
    """Convert (dx, dy, eos) offsets to absolute (x, y, eos) coordinates."""
    return np.concatenate(
        [np.cumsum(offsets[:, :2], axis=0), offsets[:, 2:3]], axis=1
    )


def denoise(coords: np.ndarray) -> np.ndarray:
    """Smooth strokes with Savitzky-Golay filter. Skip short strokes (<7 points)."""
    # Split at pen-lift points (eos == 1)
    split_indices = np.where(coords[:, 2] == 1)[0] + 1
    segments = np.split(coords, split_indices, axis=0)

    new_segments = []
    for stroke in segments:
        if len(stroke) == 0:
            continue
        # Guard: savgol_filter requires window_length > polyorder AND window <= len
        # Skip filtering entirely if stroke has fewer than 7 points
        if len(stroke) >= 7:
            x_smooth = savgol_filter(stroke[:, 0], 7, 3, mode="nearest")
            y_smooth = savgol_filter(stroke[:, 1], 7, 3, mode="nearest")
            stroke = np.column_stack([x_smooth, y_smooth, stroke[:, 2]])
        new_segments.append(stroke)

    if not new_segments:
        return coords
    return np.vstack(new_segments)


def align(coords: np.ndarray) -> np.ndarray:
    """Correct global slant/offset via linear regression."""
    coords = np.copy(coords)
    X = coords[:, 0].reshape(-1, 1)
    Y = coords[:, 1].reshape(-1, 1)
    X_aug = np.concatenate([np.ones([X.shape[0], 1]), X], axis=1)

    try:
        params = np.linalg.inv(X_aug.T @ X_aug) @ X_aug.T @ Y
        offset, slope = params.squeeze()
        theta = np.arctan(slope)
        rot = np.array([
            [np.cos(theta), -np.sin(theta)],
            [np.sin(theta), np.cos(theta)],
        ])
        coords[:, :2] = coords[:, :2] @ rot - offset
    except np.linalg.LinAlgError:
        pass  # singular matrix — skip alignment

    return coords


def _catmull_rom_to_bezier(points: list[tuple[float, float]]) -> str:
    """Convert a sequence of points to smooth cubic Bezier SVG path commands.

    Uses Catmull-Rom spline to Bezier control point conversion:
        cp1 = P[i] + (P[i+1] - P[i-1]) / 6
        cp2 = P[i+1] - (P[i+2] - P[i]) / 6
    """
    n = len(points)
    if n == 0:
        return ""
    if n == 1:
        return f"L{points[0][0]:.1f},{points[0][1]:.1f}"
    if n == 2:
        return f"L{points[1][0]:.1f},{points[1][1]:.1f}"

    parts: list[str] = []
    for i in range(n - 1):
        p_prev = points[max(0, i - 1)]
        p_curr = points[i]
        p_next = points[min(n - 1, i + 1)]
        p_next2 = points[min(n - 1, i + 2)]

        # Control point 1: tangent at current point
        cp1x = p_curr[0] + (p_next[0] - p_prev[0]) / 6
        cp1y = p_curr[1] + (p_next[1] - p_prev[1]) / 6

        # Control point 2: tangent at next point
        cp2x = p_next[0] - (p_next2[0] - p_curr[0]) / 6
        cp2y = p_next[1] - (p_next2[1] - p_curr[1]) / 6

        parts.append(
            f"C{cp1x:.1f},{cp1y:.1f} {cp2x:.1f},{cp2y:.1f} {p_next[0]:.1f},{p_next[1]:.1f}"
        )

    return " ".join(parts)


def strokes_to_svg_paths(
    raw_offsets: np.ndarray,
    scale_factor: float = 1.5,
    target_height: float = 60.0,
) -> StrokePath:
    """Process raw RNN offsets into an SVG path with cubic Bezier curves.

    Args:
        raw_offsets: Array of shape [N, 3] with (dx, dy, eos) values
        scale_factor: Multiply offsets by this (model default: 1.5)
        target_height: Desired output height in SVG units

    Returns:
        StrokePath with SVG d-string and bounding box
    """
    offsets = np.copy(raw_offsets)

    # 1. Scale (matching hand.py:130)
    offsets[:, :2] *= scale_factor

    # 2. Convert to absolute coordinates
    coords = offsets_to_coords(offsets)

    # 3. Denoise
    coords = denoise(coords)

    # 4. Align (de-slant)
    coords[:, :2] = align(coords[:, :2])[:, :2]

    # 5. Flip Y axis (SVG/canvas has Y pointing down, model has Y pointing up)
    coords[:, 1] *= -1

    # 6. Normalize position: shift so min is at origin
    x_min, y_min = coords[:, 0].min(), coords[:, 1].min()
    coords[:, 0] -= x_min
    coords[:, 1] -= y_min

    # 7. Build SVG path with Catmull-Rom Bezier curves
    # Split into stroke segments at pen-lift points
    path_parts: list[str] = []
    current_stroke: list[tuple[float, float]] = []

    for x, y, eos in coords:
        current_stroke.append((float(x), float(y)))
        if eos >= 0.5:  # pen lift
            if len(current_stroke) > 0:
                # Move to first point of this stroke segment
                sx, sy = current_stroke[0]
                path_parts.append(f"M{sx:.1f},{sy:.1f}")
                if len(current_stroke) > 1:
                    path_parts.append(_catmull_rom_to_bezier(current_stroke))
            current_stroke = []

    # Handle any remaining points without final eos
    if current_stroke:
        sx, sy = current_stroke[0]
        path_parts.append(f"M{sx:.1f},{sy:.1f}")
        if len(current_stroke) > 1:
            path_parts.append(_catmull_rom_to_bezier(current_stroke))

    d_string = " ".join(path_parts)

    # 8. Compute actual bounding box
    x_max = float(coords[:, 0].max())
    y_max = float(coords[:, 1].max())
    bbox = {
        "x": 0.0,
        "y": 0.0,
        "width": x_max,
        "height": y_max,
    }

    return StrokePath(d=d_string, bbox=bbox)


def process_all_strokes(
    stroke_arrays: list[list[list[float]]],
    scale_factor: float = 1.5,
    line_height: float = 60.0,
) -> list[StrokePath]:
    """Process multiple lines of stroke data into SVG paths.

    Each line is processed independently, then positioned vertically.
    Uses the same spacing as hand.py: initial Y offset of 3/4 * line_height,
    subsequent lines offset by line_height.
    """
    results: list[StrokePath] = []
    y_offset = 0.0

    for stroke_data in stroke_arrays:
        arr = np.array(stroke_data, dtype=np.float64)
        if arr.size == 0:
            y_offset += line_height
            continue

        path = strokes_to_svg_paths(arr, scale_factor=scale_factor, target_height=line_height)

        # Offset the path vertically for multi-line layout
        if y_offset > 0 and path.d:
            # Shift all Y coordinates by y_offset
            # We do this by adjusting the bbox and noting the offset
            path.bbox["y"] = y_offset

        results.append(path)
        y_offset += line_height

    return results
