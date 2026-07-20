from __future__ import annotations

import asyncio
import base64
import json
import math
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="CalibON Local Calibration Engine", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@dataclass(slots=True)
class Detection:
    points: np.ndarray
    method: str
    confidence: float
    fit_rms: float
    spacing: float
    outer_polygon: np.ndarray
    area_fraction: float
    blur_variance: float
    blur_score: float
    coverage_score: float
    board_center: tuple[float, float]
    board_bbox: tuple[float, float, float, float]
    pose_descriptor: np.ndarray
    estimated_rotation: tuple[float, float, float]


@dataclass(slots=True)
class CalibrationPass:
    rms: float
    camera_matrix: np.ndarray
    distortion: np.ndarray
    rvecs: list[np.ndarray]
    tvecs: list[np.ndarray]
    projected_points: list[np.ndarray]
    per_view_errors: list[float]


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "engine": "python-opencv",
        "opencvVersion": cv2.__version__,
        "findChessboardCornersSB": hasattr(cv2, "findChessboardCornersSB"),
    }


@app.post("/api/analyze")
async def analyze_dataset(
    payload: str = Form(...),
    images: list[UploadFile] = File(...),
) -> dict[str, Any]:
    config = _parse_payload(payload)
    frame_metadata = config.get("frames", [])
    if len(frame_metadata) != len(images):
        raise HTTPException(
            status_code=400,
            detail="Frame metadata and uploaded image counts do not match.",
        )

    image_bytes = [await image.read() for image in images]
    try:
        return await asyncio.to_thread(_analyze_sync, config, frame_metadata, image_bytes)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive API boundary
        raise HTTPException(status_code=500, detail=f"Dataset analysis failed: {exc}") from exc


@app.post("/api/calibrate")
async def calibrate_camera(
    payload: str = Form(...),
    images: list[UploadFile] = File(default=[]),
) -> dict[str, Any]:
    config = _parse_payload(payload)
    image_bytes = [await image.read() for image in images]
    try:
        return await asyncio.to_thread(_calibrate_sync, config, image_bytes)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive API boundary
        raise HTTPException(status_code=500, detail=f"Calibration failed: {exc}") from exc


def _parse_payload(payload: str) -> dict[str, Any]:
    try:
        value = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="The request payload is not valid JSON.") from exc
    if not isinstance(value, dict):
        raise HTTPException(status_code=400, detail="The request payload must be a JSON object.")
    return value


def _analyze_sync(
    config: dict[str, Any],
    frame_metadata: list[dict[str, Any]],
    image_bytes: list[bytes],
) -> dict[str, Any]:
    settings = _require_dict(config, "settings")
    target = _require_dict(settings, "target")
    camera = _require_dict(settings, "camera")
    columns = _positive_int(target.get("columns"), "target.columns")
    rows = _positive_int(target.get("rows"), "target.rows")
    minimum_frames = _positive_int(settings.get("minimumAcceptedFrames", 10), "minimumAcceptedFrames")
    expected_size = _require_dict(camera, "imageSize")
    expected_width = _positive_int(expected_size.get("width"), "camera.imageSize.width")
    expected_height = _positive_int(expected_size.get("height"), "camera.imageSize.height")

    analyzed: list[dict[str, Any]] = []
    detections_by_index: dict[int, Detection] = {}

    for index, (meta, raw) in enumerate(zip(frame_metadata, image_bytes, strict=True)):
        frame_id = str(meta.get("id", f"frame-{index}"))
        file_name = str(meta.get("fileName", f"frame-{index + 1}.jpg"))
        image = _decode_image(raw)
        height, width = image.shape[:2]

        if width != expected_width or height != expected_height:
            analyzed.append(
                _rejected_frame(
                    frame_id,
                    file_name,
                    blur_score=0.0,
                    reasons=["no-target-detected"],
                    diagnostics={
                        "message": f"Resolution {width}x{height} does not match {expected_width}x{expected_height}.",
                    },
                )
            )
            continue

        detection = _detect_checkerboard(image, columns, rows)
        if detection is None:
            blur_variance = _laplacian_variance(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY))
            analyzed.append(
                _rejected_frame(
                    frame_id,
                    file_name,
                    blur_score=_blur_score(blur_variance),
                    reasons=["no-target-detected"],
                    diagnostics={"message": "OpenCV could not locate every configured inner corner."},
                )
            )
            continue

        detections_by_index[index] = detection
        reasons: list[str] = []
        # Detection itself is the strongest quality gate. Only reject genuinely unusable views here.
        if detection.blur_score < 0.07:
            reasons.append("blurred")
        if detection.area_fraction < 0.0025:
            reasons.append("low-coverage")

        analyzed.append(
            {
                "id": frame_id,
                "fileName": file_name,
                "status": "accepted" if not reasons else "rejected",
                "targetDetected": True,
                "detectedPoints": [
                    {"x": _round(point[0], 4), "y": _round(point[1], 4)}
                    for point in detection.points
                ],
                "boardCenter": {
                    "x": _round(detection.board_center[0], 6),
                    "y": _round(detection.board_center[1], 6),
                },
                "boardCoverage": {
                    "minX": _round(detection.board_bbox[0], 6),
                    "minY": _round(detection.board_bbox[1], 6),
                    "maxX": _round(detection.board_bbox[2], 6),
                    "maxY": _round(detection.board_bbox[3], 6),
                },
                "estimatedRotation": {
                    "x": _round(detection.estimated_rotation[0], 6),
                    "y": _round(detection.estimated_rotation[1], 6),
                    "z": _round(detection.estimated_rotation[2], 6),
                },
                "metrics": {
                    "blurScore": _round(detection.blur_score, 4),
                    "coverageScore": _round(detection.coverage_score, 4),
                    "poseDiversityScore": 0.0,
                    "detectionConfidence": _round(detection.confidence, 4),
                },
                "rejectionReasons": reasons,
                "manuallyIncluded": False,
                "diagnostics": {
                    "method": detection.method,
                    "homographyRms": _round(detection.fit_rms, 4),
                    "medianCornerSpacing": _round(detection.spacing, 3),
                    "laplacianVariance": _round(detection.blur_variance, 3),
                    "areaFraction": _round(detection.area_fraction, 6),
                },
            }
        )

    _apply_pose_diversity(analyzed, detections_by_index)
    accepted_count = sum(frame["status"] == "accepted" for frame in analyzed)
    return {
        "frames": analyzed,
        "engine": {
            "name": "OpenCV Python",
            "version": cv2.__version__,
            "nativeCheckerboardDetector": True,
        },
        "ready": accepted_count >= minimum_frames,
    }


def _detect_checkerboard(image: np.ndarray, columns: int, rows: int) -> Detection | None:
    gray_original = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    original_height, original_width = gray_original.shape

    # Very large photos are reduced for detection, then all coordinates are mapped back.
    longest = max(original_width, original_height)
    base_scale = min(1.0, 2600.0 / float(longest))
    if base_scale < 1.0:
        base = cv2.resize(
            gray_original,
            None,
            fx=base_scale,
            fy=base_scale,
            interpolation=cv2.INTER_AREA,
        )
    else:
        base = gray_original

    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8)).apply(base)
    equalized = cv2.equalizeHist(base)
    variants: list[tuple[str, np.ndarray]] = [
        ("gray", base),
        ("clahe", clahe),
        ("equalized", equalized),
    ]

    attempts: list[tuple[str, np.ndarray, float]] = [
        ("gray", base, base_scale),
        ("clahe", clahe, base_scale),
        ("equalized", equalized, base_scale),
    ]

    # Upsampling is useful for small distant boards; downsampling often helps very large close boards.
    for factor in (1.35, 0.75):
        interpolation = cv2.INTER_CUBIC if factor > 1 else cv2.INTER_AREA
        resized = cv2.resize(base, None, fx=factor, fy=factor, interpolation=interpolation)
        attempts.append((f"gray@{factor:.2f}", resized, base_scale * factor))

    pattern = (columns, rows)
    candidates: list[tuple[np.ndarray, str, float]] = []

    # The classic detector with cornerSubPix is extremely fast and accurate on normal printed
    # calibration boards. The more expensive SB detector is reserved for difficult views.
    for variant_name, variant, scale in attempts:
        corners = _find_with_legacy(variant, pattern)
        if corners is not None:
            candidates.append((corners / scale, f"findChessboardCorners+cornerSubPix:{variant_name}", 0.95))
            break

    if not candidates:
        for variant_name, variant, scale in attempts:
            corners = _find_with_sb(variant, pattern)
            if corners is not None:
                candidates.append((corners / scale, f"findChessboardCornersSB:{variant_name}", 0.99))
                break

    if not candidates:
        return None

    best: Detection | None = None
    for points, method, method_confidence in candidates:
        validated = _validate_native_grid(
            points=points,
            columns=columns,
            rows=rows,
            width=original_width,
            height=original_height,
        )
        if validated is None:
            continue

        fit_rms, spacing, homography, outer_polygon = validated
        gray_for_blur = gray_original
        blur_variance = _masked_laplacian_variance(gray_for_blur, outer_polygon)
        blur_score = _blur_score(blur_variance)
        area_fraction = _polygon_area_inside_image(outer_polygon, original_width, original_height) / max(
            1.0, float(original_width * original_height)
        )
        coverage_score = _clamp(area_fraction / 0.24)
        fit_quality = math.exp(-fit_rms / max(1.0, spacing * 0.14))
        confidence = _clamp(method_confidence * (0.72 + 0.28 * fit_quality))

        normalized_points = points / np.array([original_width, original_height], dtype=np.float32)
        center = normalized_points.mean(axis=0)
        min_xy = normalized_points.min(axis=0)
        max_xy = normalized_points.max(axis=0)
        pose_descriptor, estimated_rotation = _pose_descriptor(points, columns, rows, original_width, original_height, area_fraction)

        current = Detection(
            points=points.astype(np.float32),
            method=method,
            confidence=confidence,
            fit_rms=fit_rms,
            spacing=spacing,
            outer_polygon=outer_polygon,
            area_fraction=area_fraction,
            blur_variance=blur_variance,
            blur_score=blur_score,
            coverage_score=coverage_score,
            board_center=(float(center[0]), float(center[1])),
            board_bbox=(float(min_xy[0]), float(min_xy[1]), float(max_xy[0]), float(max_xy[1])),
            pose_descriptor=pose_descriptor,
            estimated_rotation=estimated_rotation,
        )
        if best is None or current.confidence > best.confidence:
            best = current

    return best


def _find_with_sb(gray: np.ndarray, pattern: tuple[int, int]) -> np.ndarray | None:
    if not hasattr(cv2, "findChessboardCornersSB"):
        return None
    flag_sets = [
        cv2.CALIB_CB_NORMALIZE_IMAGE | cv2.CALIB_CB_ACCURACY,
        cv2.CALIB_CB_NORMALIZE_IMAGE | cv2.CALIB_CB_EXHAUSTIVE | cv2.CALIB_CB_ACCURACY,
    ]
    for flags in flag_sets:
        try:
            found, corners = cv2.findChessboardCornersSB(gray, pattern, flags=flags)
        except cv2.error:
            continue
        if found and corners is not None and len(corners) == pattern[0] * pattern[1]:
            return corners.reshape(-1, 2).astype(np.float32)
    return None


def _find_with_legacy(gray: np.ndarray, pattern: tuple[int, int]) -> np.ndarray | None:
    flags = cv2.CALIB_CB_ADAPTIVE_THRESH | cv2.CALIB_CB_NORMALIZE_IMAGE | cv2.CALIB_CB_FILTER_QUADS
    try:
        found, corners = cv2.findChessboardCorners(gray, pattern, flags)
    except cv2.error:
        return None
    if not found or corners is None or len(corners) != pattern[0] * pattern[1]:
        return None

    refined = corners.astype(np.float32)
    spacing_guess = _median_grid_spacing(refined.reshape(-1, 2), pattern[0], pattern[1])
    radius = int(max(3, min(15, round(spacing_guess * 0.28))))
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_MAX_ITER, 80, 1e-4)
    try:
        cv2.cornerSubPix(gray, refined, (radius, radius), (-1, -1), criteria)
    except cv2.error:
        return None
    return refined.reshape(-1, 2)


def _validate_native_grid(
    points: np.ndarray,
    columns: int,
    rows: int,
    width: int,
    height: int,
) -> tuple[float, float, np.ndarray, np.ndarray] | None:
    expected = columns * rows
    if points.shape != (expected, 2) or not np.isfinite(points).all():
        return None
    if np.any(points[:, 0] < -2) or np.any(points[:, 0] > width + 2):
        return None
    if np.any(points[:, 1] < -2) or np.any(points[:, 1] > height + 2):
        return None

    spacing = _median_grid_spacing(points, columns, rows)
    if spacing < 2.5:
        return None

    ideal = np.array(
        [(column, row) for row in range(rows) for column in range(columns)],
        dtype=np.float32,
    )
    homography, _ = cv2.findHomography(ideal, points, method=0)
    if homography is None or not np.isfinite(homography).all():
        return None

    projected = cv2.perspectiveTransform(ideal.reshape(-1, 1, 2), homography).reshape(-1, 2)
    fit_rms = float(np.sqrt(np.mean(np.sum((projected - points) ** 2, axis=1))))
    # Lens distortion prevents a perfect homography, especially near image edges. Reject only grossly invalid grids.
    if fit_rms > max(8.0, spacing * 0.32):
        return None

    grid = points.reshape(rows, columns, 2)
    horizontal = np.diff(grid, axis=1).reshape(-1, 2)
    vertical = np.diff(grid, axis=0).reshape(-1, 2)
    if np.median(np.linalg.norm(horizontal, axis=1)) < 2.5:
        return None
    if np.median(np.linalg.norm(vertical, axis=1)) < 2.5:
        return None

    outer_ideal = np.array(
        [[-1.0, -1.0], [float(columns), -1.0], [float(columns), float(rows)], [-1.0, float(rows)]],
        dtype=np.float32,
    )
    outer = cv2.perspectiveTransform(outer_ideal.reshape(-1, 1, 2), homography).reshape(-1, 2)
    if abs(cv2.contourArea(outer.astype(np.float32))) < 20:
        return None
    return fit_rms, spacing, homography, outer


def _pose_descriptor(
    points: np.ndarray,
    columns: int,
    rows: int,
    width: int,
    height: int,
    area_fraction: float,
) -> tuple[np.ndarray, tuple[float, float, float]]:
    grid = points.reshape(rows, columns, 2)
    center = points.mean(axis=0) / np.array([width, height], dtype=np.float32)
    horizontal = grid[:, -1].mean(axis=0) - grid[:, 0].mean(axis=0)
    vertical = grid[-1, :].mean(axis=0) - grid[0, :].mean(axis=0)
    z_angle = math.atan2(float(horizontal[1]), float(horizontal[0]))

    top = float(np.linalg.norm(grid[0, -1] - grid[0, 0]))
    bottom = float(np.linalg.norm(grid[-1, -1] - grid[-1, 0]))
    left = float(np.linalg.norm(grid[-1, 0] - grid[0, 0]))
    right = float(np.linalg.norm(grid[-1, -1] - grid[0, -1]))
    tilt_x = math.atan2(left - right, max(1e-6, (left + right) * 0.5))
    tilt_y = math.atan2(top - bottom, max(1e-6, (top + bottom) * 0.5))

    descriptor = np.array(
        [
            float(center[0]),
            float(center[1]),
            math.sqrt(max(0.0, area_fraction)),
            math.sin(z_angle),
            math.cos(z_angle),
            tilt_x,
            tilt_y,
        ],
        dtype=np.float64,
    )
    return descriptor, (tilt_x, tilt_y, z_angle)


def _apply_pose_diversity(
    analyzed: list[dict[str, Any]],
    detections_by_index: dict[int, Detection],
) -> None:
    detected_indices = list(detections_by_index)
    if len(detected_indices) <= 1:
        for index in detected_indices:
            analyzed[index]["metrics"]["poseDiversityScore"] = 1.0
        return

    scales = np.array([1.4, 1.4, 1.2, 0.35, 0.35, 1.5, 1.5], dtype=np.float64)
    for index in detected_indices:
        descriptor = detections_by_index[index].pose_descriptor
        distances = []
        for other_index in detected_indices:
            if other_index == index:
                continue
            difference = (descriptor - detections_by_index[other_index].pose_descriptor) * scales
            distances.append(float(np.linalg.norm(difference)))
        nearest = sorted(distances)[: min(3, len(distances))]
        score = _clamp((sum(nearest) / max(1, len(nearest))) / 0.42)
        analyzed[index]["metrics"]["poseDiversityScore"] = _round(score, 4)


def _rejected_frame(
    frame_id: str,
    file_name: str,
    blur_score: float,
    reasons: list[str],
    diagnostics: dict[str, Any],
) -> dict[str, Any]:
    return {
        "id": frame_id,
        "fileName": file_name,
        "status": "rejected",
        "targetDetected": False,
        "detectedPoints": [],
        "boardCenter": None,
        "boardCoverage": None,
        "estimatedRotation": None,
        "metrics": {
            "blurScore": _round(blur_score, 4),
            "coverageScore": 0.0,
            "poseDiversityScore": 0.0,
            "detectionConfidence": 0.0,
        },
        "rejectionReasons": reasons,
        "manuallyIncluded": False,
        "diagnostics": diagnostics,
    }


def _calibrate_sync(config: dict[str, Any], image_bytes: list[bytes]) -> dict[str, Any]:
    started = time.perf_counter()
    settings = _require_dict(config, "settings")
    target = _require_dict(settings, "target")
    camera = _require_dict(settings, "camera")
    image_size = _require_dict(camera, "imageSize")
    width = _positive_int(image_size.get("width"), "camera.imageSize.width")
    height = _positive_int(image_size.get("height"), "camera.imageSize.height")
    columns = _positive_int(target.get("columns"), "target.columns")
    rows = _positive_int(target.get("rows"), "target.rows")
    square_size = float(target.get("squareSizeMm", 1.0))
    minimum_frames = _positive_int(settings.get("minimumAcceptedFrames", 10), "minimumAcceptedFrames")
    observations = config.get("observations", [])
    if not isinstance(observations, list):
        raise HTTPException(status_code=400, detail="observations must be an array.")

    expected_points = columns * rows
    valid_observations: list[dict[str, Any]] = []
    image_points: list[np.ndarray] = []
    for observation in observations:
        points = observation.get("points", []) if isinstance(observation, dict) else []
        if len(points) != expected_points:
            continue
        point_array = np.asarray([[float(point["x"]), float(point["y"])] for point in points], dtype=np.float32)
        if point_array.shape != (expected_points, 2) or not np.isfinite(point_array).all():
            continue
        valid_observations.append(observation)
        image_points.append(point_array.reshape(-1, 1, 2))

    if len(valid_observations) < minimum_frames:
        raise HTTPException(
            status_code=400,
            detail=f"At least {minimum_frames} valid checkerboard views are required; received {len(valid_observations)}.",
        )

    object_template = np.zeros((expected_points, 3), dtype=np.float32)
    object_template[:, :2] = np.array(
        [(column * square_size, row * square_size) for row in range(rows) for column in range(columns)],
        dtype=np.float32,
    )

    active_indices = list(range(len(valid_observations)))
    removed_indices: list[int] = []
    maximum_removals = min(
        len(active_indices) - minimum_frames,
        max(1, int(math.ceil(len(active_indices) * 0.35))),
    )

    final_pass: CalibrationPass | None = None
    for _iteration in range(maximum_removals + 2):
        active_image_points = [image_points[index] for index in active_indices]
        active_object_points = [object_template.copy() for _ in active_indices]
        current = _solve_calibration(
            active_object_points,
            active_image_points,
            (width, height),
            settings,
            fix_k3=True,
        )
        final_pass = current
        if len(active_indices) <= minimum_frames or len(removed_indices) >= maximum_removals:
            break

        threshold = _robust_error_threshold(current.per_view_errors)
        worst_local = int(np.argmax(current.per_view_errors))
        worst_error = current.per_view_errors[worst_local]
        model_plausible = _model_is_plausible(current.camera_matrix, current.distortion, width, height)
        if worst_error <= threshold and model_plausible:
            break

        removed_indices.append(active_indices.pop(worst_local))

    if final_pass is None:
        raise HTTPException(status_code=500, detail="OpenCV did not return a calibration result.")

    if not _model_is_plausible(final_pass.camera_matrix, final_pass.distortion, width, height):
        raise HTTPException(
            status_code=422,
            detail=(
                "OpenCV found a numerically unstable camera model. Capture more tilted views and move the board "
                "toward the image corners, then analyze and calibrate again."
            ),
        )

    frame_results: list[dict[str, Any]] = []
    active_frame_ids: list[str] = []
    for local_index, observation_index in enumerate(active_indices):
        observation = valid_observations[observation_index]
        frame_id = str(observation.get("id"))
        active_frame_ids.append(frame_id)
        projected = final_pass.projected_points[local_index]
        rvec = final_pass.rvecs[local_index].reshape(-1)
        tvec = final_pass.tvecs[local_index].reshape(-1)
        frame_results.append(
            {
                "frameId": frame_id,
                "reprojectionError": _round(final_pass.per_view_errors[local_index], 6),
                "rotation": {"x": _round(rvec[0], 9), "y": _round(rvec[1], 9), "z": _round(rvec[2], 9)},
                "translation": {"x": _round(tvec[0], 9), "y": _round(tvec[1], 9), "z": _round(tvec[2], 9)},
                "projectedPoints": [
                    {"x": _round(point[0], 4), "y": _round(point[1], 4)} for point in projected
                ],
                "accepted": True,
            }
        )

    errors = final_pass.per_view_errors
    statistics = _error_statistics(errors, final_pass.rms)
    camera_matrix = final_pass.camera_matrix
    distortion = final_pass.distortion.reshape(-1)
    removed_frame_ids = [str(valid_observations[index].get("id")) for index in removed_indices]

    preview = _create_preview(
        valid_observations=valid_observations,
        active_indices=active_indices,
        errors=errors,
        image_bytes=image_bytes,
        camera_matrix=camera_matrix,
        distortion=distortion,
        image_size=(width, height),
    )

    result = {
        "id": f"calibration-{uuid.uuid4()}",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "camera": camera,
        "target": target,
        "imageSize": {"width": width, "height": height},
        "intrinsics": {
            "fx": _round(camera_matrix[0, 0], 8),
            "fy": _round(camera_matrix[1, 1], 8),
            "cx": _round(camera_matrix[0, 2], 8),
            "cy": _round(camera_matrix[1, 2], 8),
            "skew": _round(camera_matrix[0, 1], 8),
            "cameraMatrix": [
                [_round(camera_matrix[0, 0], 8), _round(camera_matrix[0, 1], 8), _round(camera_matrix[0, 2], 8)],
                [_round(camera_matrix[1, 0], 8), _round(camera_matrix[1, 1], 8), _round(camera_matrix[1, 2], 8)],
                [_round(camera_matrix[2, 0], 8), _round(camera_matrix[2, 1], 8), _round(camera_matrix[2, 2], 8)],
            ],
        },
        "distortion": {
            "model": "pinhole",
            "k1": _round(distortion[0] if len(distortion) > 0 else 0.0, 10),
            "k2": _round(distortion[1] if len(distortion) > 1 else 0.0, 10),
            "p1": _round(distortion[2] if len(distortion) > 2 else 0.0, 10),
            "p2": _round(distortion[3] if len(distortion) > 3 else 0.0, 10),
            "k3": _round(distortion[4] if len(distortion) > 4 else 0.0, 10),
        },
        "statistics": statistics,
        "frames": frame_results,
        "acceptedFrameIds": active_frame_ids,
        "rejectedFrameIds": removed_frame_ids,
        "quality": _quality_from_rms(statistics["rmsError"]),
        "calibrationDurationMs": int(round((time.perf_counter() - started) * 1000)),
    }
    return {
        "result": result,
        "outlierFrameIds": removed_frame_ids,
        "preview": preview,
        "engine": {"name": "OpenCV Python", "version": cv2.__version__},
    }


def _solve_calibration(
    object_points: list[np.ndarray],
    image_points: list[np.ndarray],
    image_size: tuple[int, int],
    settings: dict[str, Any],
    fix_k3: bool,
) -> CalibrationPass:
    width, height = image_size
    camera_matrix = cv2.initCameraMatrix2D(object_points, image_points, image_size, aspectRatio=1.0)
    camera_matrix[0, 2] = width / 2.0
    camera_matrix[1, 2] = height / 2.0

    flags = cv2.CALIB_USE_INTRINSIC_GUESS
    if fix_k3:
        flags |= cv2.CALIB_FIX_K3
    if not bool(settings.get("enableTangentialDistortion", True)):
        flags |= cv2.CALIB_ZERO_TANGENT_DIST
    if bool(settings.get("fixPrincipalPoint", False)):
        flags |= cv2.CALIB_FIX_PRINCIPAL_POINT
    if bool(settings.get("fixAspectRatio", False)):
        flags |= cv2.CALIB_FIX_ASPECT_RATIO
        camera_matrix[1, 1] = camera_matrix[0, 0]

    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_MAX_ITER, 100, 1e-9)
    rms, camera_matrix, distortion, rvecs, tvecs = cv2.calibrateCamera(
        object_points,
        image_points,
        image_size,
        camera_matrix,
        np.zeros((5, 1), dtype=np.float64),
        flags=flags,
        criteria=criteria,
    )

    projected_points: list[np.ndarray] = []
    per_view_errors: list[float] = []
    for object_view, image_view, rvec, tvec in zip(
        object_points, image_points, rvecs, tvecs, strict=True
    ):
        projected, _ = cv2.projectPoints(object_view, rvec, tvec, camera_matrix, distortion)
        projected_flat = projected.reshape(-1, 2)
        observed_flat = image_view.reshape(-1, 2)
        error = float(np.sqrt(np.mean(np.sum((projected_flat - observed_flat) ** 2, axis=1))))
        projected_points.append(projected_flat)
        per_view_errors.append(error)

    return CalibrationPass(
        rms=float(rms),
        camera_matrix=camera_matrix,
        distortion=distortion,
        rvecs=list(rvecs),
        tvecs=list(tvecs),
        projected_points=projected_points,
        per_view_errors=per_view_errors,
    )


def _create_preview(
    valid_observations: list[dict[str, Any]],
    active_indices: list[int],
    errors: list[float],
    image_bytes: list[bytes],
    camera_matrix: np.ndarray,
    distortion: np.ndarray,
    image_size: tuple[int, int],
) -> dict[str, Any] | None:
    if not active_indices or not image_bytes:
        return None
    order = np.argsort(np.asarray(errors))
    median_local = int(order[len(order) // 2])
    observation_index = active_indices[median_local]
    if observation_index >= len(image_bytes):
        return None
    image = _decode_image(image_bytes[observation_index])
    new_matrix, _ = cv2.getOptimalNewCameraMatrix(
        camera_matrix,
        distortion,
        image_size,
        0.0,
        image_size,
    )
    corrected = cv2.undistort(image, camera_matrix, distortion, None, new_matrix)
    success, encoded = cv2.imencode(".jpg", corrected, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not success:
        return None
    return {
        "frameId": str(valid_observations[observation_index].get("id")),
        "correctedImageUrl": "data:image/jpeg;base64," + base64.b64encode(encoded.tobytes()).decode("ascii"),
    }


def _robust_error_threshold(errors: Iterable[float]) -> float:
    values = np.asarray(list(errors), dtype=np.float64)
    if values.size == 0:
        return math.inf
    median = float(np.median(values))
    mad = float(np.median(np.abs(values - median)))
    robust_sigma = max(0.03, 1.4826 * mad)
    return max(0.8, median * 2.4, median + 3.2 * robust_sigma)


def _model_is_plausible(camera_matrix: np.ndarray, distortion: np.ndarray, width: int, height: int) -> bool:
    values = np.concatenate([camera_matrix.reshape(-1), distortion.reshape(-1)])
    if not np.isfinite(values).all():
        return False
    fx = float(camera_matrix[0, 0])
    fy = float(camera_matrix[1, 1])
    cx = float(camera_matrix[0, 2])
    cy = float(camera_matrix[1, 2])
    maximum = float(max(width, height))
    if not (0.2 * maximum < fx < 10.0 * maximum and 0.2 * maximum < fy < 10.0 * maximum):
        return False
    if max(fx, fy) / max(1e-9, min(fx, fy)) > 1.45:
        return False
    if not (-0.25 * width < cx < 1.25 * width and -0.25 * height < cy < 1.25 * height):
        return False
    coefficients = distortion.reshape(-1)
    limits = [4.0, 12.0, 0.6, 0.6, 12.0]
    return all(abs(float(value)) < limits[index] for index, value in enumerate(coefficients[:5]))


def _error_statistics(errors: list[float], overall_rms: float) -> dict[str, float]:
    values = np.asarray(errors, dtype=np.float64)
    return {
        "rmsError": _round(overall_rms, 6),
        "meanReprojectionError": _round(float(np.mean(values)) if values.size else 0.0, 6),
        "medianReprojectionError": _round(float(np.median(values)) if values.size else 0.0, 6),
        "maximumReprojectionError": _round(float(np.max(values)) if values.size else 0.0, 6),
        "minimumReprojectionError": _round(float(np.min(values)) if values.size else 0.0, 6),
        "standardDeviation": _round(float(np.std(values)) if values.size else 0.0, 6),
    }


def _quality_from_rms(rms: float) -> str:
    if rms <= 0.35:
        return "excellent"
    if rms <= 0.65:
        return "good"
    if rms <= 1.0:
        return "fair"
    return "poor"


def _decode_image(raw: bytes) -> np.ndarray:
    if not raw:
        raise HTTPException(status_code=400, detail="An uploaded image was empty.")
    encoded = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="An uploaded file could not be decoded as an image.")
    return image


def _median_grid_spacing(points: np.ndarray, columns: int, rows: int) -> float:
    grid = points.reshape(rows, columns, 2)
    distances: list[np.ndarray] = []
    if columns > 1:
        distances.append(np.linalg.norm(np.diff(grid, axis=1), axis=2).reshape(-1))
    if rows > 1:
        distances.append(np.linalg.norm(np.diff(grid, axis=0), axis=2).reshape(-1))
    if not distances:
        return 0.0
    return float(np.median(np.concatenate(distances)))


def _laplacian_variance(gray: np.ndarray) -> float:
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _masked_laplacian_variance(gray: np.ndarray, polygon: np.ndarray) -> float:
    mask = np.zeros_like(gray, dtype=np.uint8)
    clipped = polygon.copy()
    clipped[:, 0] = np.clip(clipped[:, 0], 0, gray.shape[1] - 1)
    clipped[:, 1] = np.clip(clipped[:, 1], 0, gray.shape[0] - 1)
    cv2.fillConvexPoly(mask, np.round(clipped).astype(np.int32), 255)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    values = laplacian[mask > 0]
    return float(values.var()) if values.size > 100 else float(laplacian.var())


def _blur_score(variance: float) -> float:
    # Log scaling is much less camera-dependent than a raw variance threshold.
    return _clamp((math.log10(max(1.0, variance)) - 1.1) / 1.7)


def _polygon_area_inside_image(polygon: np.ndarray, width: int, height: int) -> float:
    image_polygon = np.array(
        [[0.0, 0.0], [float(width - 1), 0.0], [float(width - 1), float(height - 1)], [0.0, float(height - 1)]],
        dtype=np.float32,
    )
    try:
        area, _intersection = cv2.intersectConvexConvex(
            polygon.astype(np.float32), image_polygon
        )
        return float(max(0.0, area))
    except cv2.error:
        clipped = polygon.copy()
        clipped[:, 0] = np.clip(clipped[:, 0], 0, width - 1)
        clipped[:, 1] = np.clip(clipped[:, 1], 0, height - 1)
        return float(abs(cv2.contourArea(clipped.astype(np.float32))))


def _require_dict(container: dict[str, Any], key: str) -> dict[str, Any]:
    value = container.get(key)
    if not isinstance(value, dict):
        raise HTTPException(status_code=400, detail=f"{key} must be an object.")
    return value


def _positive_int(value: Any, name: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"{name} must be an integer.") from exc
    if parsed <= 0:
        raise HTTPException(status_code=400, detail=f"{name} must be positive.")
    return parsed


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return min(maximum, max(minimum, float(value)))


def _round(value: float, digits: int = 6) -> float:
    return round(float(value), digits)
