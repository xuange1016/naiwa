"""Create transparent cutouts using deterministic colour or foreground-model segmentation."""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Remove edge-connected light backgrounds while preserving enclosed light subject details."
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument(
        "--mode",
        choices=("edge-background", "yellow-subject", "yellow-subject-grabcut", "yellow-subject-focused", "rembg"),
        default="edge-background",
        help="Segmentation strategy (default: edge-background).",
    )
    parser.add_argument(
        "--min-value",
        type=int,
        default=165,
        help="Minimum HSV brightness treated as a possible background pixel (default: 165).",
    )
    parser.add_argument(
        "--max-saturation",
        type=int,
        default=100,
        help="Maximum HSV saturation treated as a possible background pixel (default: 100).",
    )
    return parser.parse_args()


def edge_background_mask(hsv: np.ndarray, min_value: int, max_saturation: int) -> np.ndarray:
    possible_background = ((hsv[:, :, 1] <= max_saturation) & (hsv[:, :, 2] >= min_value)).astype(np.uint8)
    _, labels = cv2.connectedComponents(possible_background, connectivity=4)
    border_labels = np.unique(
        np.concatenate((labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]))
    )
    return ~(np.isin(labels, border_labels) & (labels != 0))


def yellow_subject_mask(hsv: np.ndarray) -> np.ndarray:
    # OpenCV hue is in [0, 179]. These bounds include the Naiwa yellow body,
    # while excluding its near-white belly and background. Filling the outer
    # contour then deliberately restores the enclosed belly, eyes, and hands.
    # Keep only the saturated, bright Naiwa-yellow pixels as foreground seeds.
    # A looser range also catches warm floors, lamps, and cream backgrounds,
    # which can make the largest contour accidentally include the whole scene.
    yellow = cv2.inRange(hsv, np.array((12, 130, 120)), np.array((42, 255, 255)))
    yellow = cv2.morphologyEx(yellow, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    contours, _ = cv2.findContours(yellow, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise ValueError("Unable to find a yellow subject contour in this frame.")

    subject = np.zeros(yellow.shape, dtype=np.uint8)
    cv2.drawContours(subject, [max(contours, key=cv2.contourArea)], -1, 255, thickness=cv2.FILLED)
    return subject.astype(bool)


def focused_yellow_subject_mask(hsv: np.ndarray) -> np.ndarray:
    """Make a compact cutout for warm, busy scenes with a centered Naiwa."""
    yellow = cv2.inRange(hsv, np.array((12, 130, 120)), np.array((42, 255, 255)))
    contours, _ = cv2.findContours(yellow, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise ValueError("Unable to find a yellow subject contour in this frame.")

    # The torso may be divided by the white belly. Retain its two dominant
    # yellow regions only, which avoids nearby warm lamps and floor reflections.
    subject = np.zeros(yellow.shape, dtype=np.uint8)
    cv2.drawContours(subject, sorted(contours, key=cv2.contourArea, reverse=True)[:2], -1, 255, thickness=cv2.FILLED)

    scale = min(subject.shape) / 200
    close_size = max(3, int(round(45 * scale)) | 1)
    dilate_size = max(3, int(round(7 * scale)) | 1)
    subject = cv2.morphologyEx(
        subject,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close_size, close_size)),
    )
    subject = cv2.dilate(
        subject,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dilate_size, dilate_size)),
    )
    return subject.astype(bool)


def grabcut_yellow_subject_mask(bgr: np.ndarray, hsv: np.ndarray) -> np.ndarray:
    """Preserve pale belly details against a simple, non-yellow background."""
    yellow = cv2.inRange(hsv, np.array((12, 130, 120)), np.array((42, 255, 255)))
    seed_size = max(3, int(round(9 * min(yellow.shape) / 200)) | 1)
    yellow = cv2.morphologyEx(
        yellow,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (seed_size, seed_size)),
    )
    contours, _ = cv2.findContours(yellow, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise ValueError("Unable to find a yellow subject contour in this frame.")

    x, y, width, height = cv2.boundingRect(max(contours, key=cv2.contourArea))
    margin = max(4, round(max(width, height) * 0.08))
    x1, y1 = max(1, x - margin), max(1, y - margin)
    x2 = min(bgr.shape[1] - 1, x + width + margin)
    y2 = min(bgr.shape[0] - 1, y + height + margin)
    mask = np.full(bgr.shape[:2], cv2.GC_BGD, dtype=np.uint8)
    mask[y1:y2, x1:x2] = cv2.GC_PR_FGD
    mask[yellow > 0] = cv2.GC_FGD
    background_model = np.zeros((1, 65), dtype=np.float64)
    foreground_model = np.zeros((1, 65), dtype=np.float64)
    cv2.grabCut(bgr, mask, None, background_model, foreground_model, 5, cv2.GC_INIT_WITH_MASK)
    return ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD))


def rembg_subject_mask(bgr: np.ndarray) -> np.ndarray:
    """Use U^2-Net when a scene background is too similar to the yellow pet."""
    from PIL import Image
    from rembg import new_session, remove

    rgba = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGBA)
    # The current rembg default can select a roughly 1 GB model. u2netp is the
    # compact foreground model intended for local, repeatable asset processing.
    result = np.asarray(remove(Image.fromarray(rgba), session=new_session("u2netp")))
    if result.ndim != 3 or result.shape[2] != 4:
        raise ValueError("Foreground model did not return an RGBA image.")
    return result[:, :, 3] > 16


def main() -> None:
    args = parse_args()
    if not 0 <= args.min_value <= 255 or not 0 <= args.max_saturation <= 255:
        raise ValueError("--min-value and --max-saturation must be between 0 and 255.")

    image = cv2.imread(str(args.input), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise FileNotFoundError(f"Unable to read image: {args.input}")

    if image.ndim != 3 or image.shape[2] not in (3, 4):
        raise ValueError("Input must be an RGB or RGBA image.")

    bgr = image[:, :, :3]
    alpha = image[:, :, 3].copy() if image.shape[2] == 4 else np.full(image.shape[:2], 255, dtype=np.uint8)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    if args.mode == "yellow-subject":
        subject_mask = yellow_subject_mask(hsv)
    elif args.mode == "yellow-subject-grabcut":
        subject_mask = grabcut_yellow_subject_mask(bgr, hsv)
    elif args.mode == "yellow-subject-focused":
        subject_mask = focused_yellow_subject_mask(hsv)
    elif args.mode == "rembg":
        subject_mask = rembg_subject_mask(bgr)
    else:
        subject_mask = edge_background_mask(hsv, args.min_value, args.max_saturation)
    alpha[~subject_mask] = 0

    output = np.dstack((bgr, alpha))
    if not cv2.imwrite(str(args.output), output):
        raise OSError(f"Unable to write image: {args.output}")


if __name__ == "__main__":
    main()
