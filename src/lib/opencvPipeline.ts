import type {
  CalibrationFrame,
  CalibrationProject,
  CalibrationQuality,
  CalibrationResult,
  DatasetSummary,
  RejectionReason,
  UndistortionPreview,
} from "../types/calibration";

type ProgressCallback = (processed: number, total: number, message: string) => void;

type AnalyzeFrameResponse = {
  id: string;
  fileName: string;
  status: "accepted" | "rejected";
  targetDetected: boolean;
  detectedPoints: Array<{ x: number; y: number }>;
  boardCenter?: { x: number; y: number } | null;
  boardCoverage?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null;
  estimatedRotation?: { x: number; y: number; z: number } | null;
  metrics: {
    blurScore: number;
    coverageScore: number;
    poseDiversityScore: number;
    detectionConfidence: number;
  };
  rejectionReasons: RejectionReason[];
  manuallyIncluded: boolean;
};

type AnalyzeResponse = {
  frames: AnalyzeFrameResponse[];
  ready: boolean;
  engine?: {
    name: string;
    version: string;
    nativeCheckerboardDetector?: boolean;
  };
};

type CalibrationResponse = {
  result: CalibrationResult;
  outlierFrameIds: string[];
  preview?: {
    frameId: string;
    correctedImageUrl: string;
  } | null;
  engine?: {
    name: string;
    version: string;
  };
};

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ??
  "http://127.0.0.1:8000";

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

const round = (value: number, digits = 4) => Number(value.toFixed(digits));

export async function analyzeCalibrationDataset(
  project: CalibrationProject,
  onProgress?: ProgressCallback,
): Promise<{ frames: CalibrationFrame[]; summary: DatasetSummary }> {
  const total = project.frames.length;
  if (total === 0) {
    return { frames: [], summary: summarizeDataset([]) };
  }

  onProgress?.(0, total + 1, "Connecting to the local OpenCV calibration engine");
  await assertBackendAvailable();

  const form = new FormData();
  form.append(
    "payload",
    JSON.stringify({
      settings: project.settings,
      frames: project.frames.map((frame) => ({
        id: frame.id,
        fileName: frame.fileName,
      })),
    }),
  );

  for (let index = 0; index < project.frames.length; index += 1) {
    const frame = project.frames[index];
    onProgress?.(
      index + 1,
      total + 1,
      `Preparing ${frame.fileName} for native checkerboard detection`,
    );
    const blob = await sourceUrlToBlob(frame.sourceUrl);
    form.append("images", blob, frame.fileName);
    await yieldToBrowser();
  }

  onProgress?.(total, total + 1, "Running OpenCV findChessboardCornersSB and quality analysis");
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    body: form,
  });
  const data = await parseResponse<AnalyzeResponse>(response);
  const analyzedById = new Map(data.frames.map((frame) => [frame.id, frame]));

  const frames = project.frames.map((frame) => {
    const analyzed = analyzedById.get(frame.id);
    if (!analyzed) {
      return {
        ...frame,
        status: "rejected" as const,
        targetDetected: false,
        detectedPoints: [],
        boardCenter: undefined,
        boardCoverage: undefined,
        estimatedRotation: undefined,
        estimatedTranslation: undefined,
        metrics: {
          blurScore: 0,
          coverageScore: 0,
          poseDiversityScore: 0,
          detectionConfidence: 0,
        },
        rejectionReasons: ["no-target-detected" as const],
        manuallyIncluded: false,
      };
    }

    return {
      ...frame,
      status: analyzed.status,
      targetDetected: analyzed.targetDetected,
      detectedPoints: analyzed.detectedPoints,
      boardCenter: analyzed.boardCenter ?? undefined,
      boardCoverage: analyzed.boardCoverage ?? undefined,
      estimatedRotation: analyzed.estimatedRotation ?? undefined,
      estimatedTranslation: undefined,
      metrics: {
        ...frame.metrics,
        ...analyzed.metrics,
        reprojectionError: undefined,
      },
      rejectionReasons: analyzed.rejectionReasons,
      manuallyIncluded: analyzed.manuallyIncluded,
    };
  });

  onProgress?.(total + 1, total + 1, "Native checkerboard analysis complete");
  return {
    frames,
    summary: summarizeDataset(frames),
  };
}

export async function runOpenCvCalibration(
  project: CalibrationProject,
  onProgress?: ProgressCallback,
): Promise<{
  result: CalibrationResult;
  preview?: UndistortionPreview;
  frames: CalibrationFrame[];
  summary: DatasetSummary;
}> {
  if (project.settings.camera.model !== "pinhole") {
    throw new Error("The current local solver supports pinhole calibration only.");
  }

  const expectedPointCount =
    project.settings.target.columns * project.settings.target.rows;
  const accepted = project.frames.filter(
    (frame) =>
      frame.status === "accepted" &&
      frame.targetDetected &&
      frame.detectedPoints.length === expectedPointCount,
  );

  if (accepted.length < project.settings.minimumAcceptedFrames) {
    throw new Error(
      `At least ${project.settings.minimumAcceptedFrames} accepted checkerboard views are required.`,
    );
  }

  onProgress?.(0, accepted.length + 2, "Connecting to the local OpenCV calibration engine");
  await assertBackendAvailable();

  const form = new FormData();
  form.append(
    "payload",
    JSON.stringify({
      settings: project.settings,
      observations: accepted.map((frame) => ({
        id: frame.id,
        fileName: frame.fileName,
        points: frame.detectedPoints,
      })),
    }),
  );

  for (let index = 0; index < accepted.length; index += 1) {
    const frame = accepted[index];
    onProgress?.(
      index + 1,
      accepted.length + 2,
      `Preparing observation ${index + 1} of ${accepted.length}`,
    );
    form.append("images", await sourceUrlToBlob(frame.sourceUrl), frame.fileName);
    await yieldToBrowser();
  }

  onProgress?.(
    accepted.length + 1,
    accepted.length + 2,
    "Optimizing intrinsics and removing high-error views",
  );
  const response = await fetch(`${API_BASE}/api/calibrate`, {
    method: "POST",
    body: form,
  });
  const data = await parseResponse<CalibrationResponse>(response);
  const outlierIds = new Set(data.outlierFrameIds ?? []);
  const activeIds = new Set(data.result.acceptedFrameIds);
  const frameResultsById = new Map(
    data.result.frames.map((frameResult) => [frameResult.frameId, frameResult]),
  );

  const frames = project.frames.map((frame) => {
    if (outlierIds.has(frame.id)) {
      return {
        ...frame,
        status: "rejected" as const,
        metrics: {
          ...frame.metrics,
          reprojectionError: frameResultsById.get(frame.id)?.reprojectionError,
        },
        rejectionReasons: frame.rejectionReasons.includes("high-reprojection-error")
          ? frame.rejectionReasons
          : [...frame.rejectionReasons, "high-reprojection-error" as const],
      };
    }

    if (activeIds.has(frame.id)) {
      return {
        ...frame,
        status: "accepted" as const,
        metrics: {
          ...frame.metrics,
          reprojectionError: frameResultsById.get(frame.id)?.reprojectionError,
        },
        rejectionReasons: frame.rejectionReasons.filter(
          (reason) => reason !== "high-reprojection-error",
        ),
      };
    }

    return frame;
  });

  const allRejectedIds = frames
    .filter((frame) => frame.status === "rejected")
    .map((frame) => frame.id);
  const result: CalibrationResult = {
    ...data.result,
    camera: { ...project.settings.camera },
    target: { ...project.settings.target },
    imageSize: { ...project.settings.camera.imageSize },
    rejectedFrameIds: allRejectedIds,
  };

  const previewFrame = data.preview
    ? project.frames.find((frame) => frame.id === data.preview?.frameId)
    : undefined;
  const preview: UndistortionPreview | undefined =
    data.preview && previewFrame
      ? {
          frameId: data.preview.frameId,
          originalImageUrl: previewFrame.sourceUrl,
          correctedImageUrl: data.preview.correctedImageUrl,
          generatedAt: new Date().toISOString(),
        }
      : undefined;

  onProgress?.(accepted.length + 2, accepted.length + 2, "Calibration complete");
  return {
    result,
    preview,
    frames,
    summary: summarizeDataset(frames),
  };
}

export function summarizeDataset(frames: CalibrationFrame[]): DatasetSummary {
  const acceptedFrames = frames.filter((frame) => frame.status === "accepted");
  const detectedFrames = frames.filter((frame) => frame.targetDetected);
  const average = (selector: (frame: CalibrationFrame) => number) =>
    detectedFrames.length === 0
      ? 0
      : detectedFrames.reduce((sum, frame) => sum + selector(frame), 0) /
        detectedFrames.length;

  const rows = 4;
  const columns = 6;
  const counts = Array.from({ length: rows * columns }, () => 0);

  acceptedFrames.forEach((frame) => {
    const occupied = new Set<number>();
    if (frame.detectedPoints.length > 0 && frame.dimensions.width > 0 && frame.dimensions.height > 0) {
      frame.detectedPoints.forEach((point) => {
        const column = Math.min(
          columns - 1,
          Math.max(0, Math.floor((point.x / frame.dimensions.width) * columns)),
        );
        const row = Math.min(
          rows - 1,
          Math.max(0, Math.floor((point.y / frame.dimensions.height) * rows)),
        );
        occupied.add(row * columns + column);
      });
    } else if (frame.boardCenter) {
      const column = Math.min(columns - 1, Math.floor(clamp(frame.boardCenter.x) * columns));
      const row = Math.min(rows - 1, Math.floor(clamp(frame.boardCenter.y) * rows));
      occupied.add(row * columns + column);
    }
    occupied.forEach((index) => {
      counts[index] += 1;
    });
  });

  const maximumCount = Math.max(1, ...counts);
  const cells = counts.map((observationCount, index) => ({
    row: Math.floor(index / columns),
    column: index % columns,
    score: round(observationCount / maximumCount, 3),
    observationCount,
  }));
  const occupiedCells = counts.filter((count) => count > 0).length;
  const coveredAreaPercent = round((occupiedCells / counts.length) * 100, 1);
  const coverageScore = clamp(
    (coveredAreaPercent / 100) * 0.78 + Math.min(1, acceptedFrames.length / 18) * 0.22,
  );
  const meanBlur = average((frame) => frame.metrics.blurScore);
  const meanCoverage = average((frame) => frame.metrics.coverageScore);
  const meanDiversity = average((frame) => frame.metrics.poseDiversityScore);
  const combinedQuality =
    coverageScore * 0.38 + meanBlur * 0.2 + meanCoverage * 0.18 + meanDiversity * 0.24;
  const quality: CalibrationQuality =
    combinedQuality >= 0.84
      ? "excellent"
      : combinedQuality >= 0.7
        ? "good"
        : combinedQuality >= 0.55
          ? "fair"
          : "poor";

  return {
    totalFrames: frames.length,
    acceptedFrames: acceptedFrames.length,
    rejectedFrames: frames.filter((frame) => frame.status === "rejected").length,
    pendingFrames: frames.filter((frame) => frame.status === "pending").length,
    detectedFrames: detectedFrames.length,
    averageBlurScore: round(meanBlur, 3),
    averageCoverageScore: round(meanCoverage, 3),
    averagePoseDiversityScore: round(meanDiversity, 3),
    datasetCoverage: {
      rows,
      columns,
      overallScore: round(coverageScore, 3),
      coveredAreaPercent,
      cells,
    },
    quality,
  };
}

export function setFrameIncluded(
  project: CalibrationProject,
  frameId: string,
  include: boolean,
): CalibrationProject {
  const frames = project.frames.map((frame) => {
    if (frame.id !== frameId) {
      return frame;
    }

    if (include && frame.targetDetected) {
      return {
        ...frame,
        status: "accepted" as const,
        manuallyIncluded: true,
        rejectionReasons: frame.rejectionReasons.filter(
          (reason) =>
            reason !== "manual-exclusion" && reason !== "high-reprojection-error",
        ),
      };
    }

    return {
      ...frame,
      status: "rejected" as const,
      manuallyIncluded: false,
      rejectionReasons: frame.rejectionReasons.includes("manual-exclusion")
        ? frame.rejectionReasons
        : [...frame.rejectionReasons, "manual-exclusion" as const],
    };
  });

  return {
    ...project,
    frames,
    datasetSummary: summarizeDataset(frames),
    result: undefined,
    preview: undefined,
    progress: {
      status: "idle",
      stage: "idle",
      progressPercent: 0,
      message: "Dataset selection changed. Run calibration again.",
      processedFrames: 0,
      totalFrames: frames.length,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function isDatasetReady(project: CalibrationProject) {
  const requiredPointCount =
    project.settings.target.columns * project.settings.target.rows;
  const acceptedFrames = project.frames.filter(
    (frame) =>
      frame.status === "accepted" &&
      frame.targetDetected &&
      frame.detectedPoints.length === requiredPointCount,
  ).length;

  return Boolean(
    project.datasetSummary &&
      project.datasetSummary.pendingFrames === 0 &&
      acceptedFrames >= project.settings.minimumAcceptedFrames,
  );
}

async function assertBackendAvailable() {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new Error(
      "The local calibration engine is not running. Start it with .\\start-calibon.ps1, then try again.",
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new Error(
      "The local calibration engine did not respond correctly. Restart .\\start-calibon.ps1.",
    );
  }
}

async function sourceUrlToBlob(sourceUrl: string) {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error("An uploaded image could not be read from browser memory.");
  }
  return response.blob();
}

async function parseResponse<T>(response: Response): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? String((payload as { detail: unknown }).detail)
        : `The calibration engine returned HTTP ${response.status}.`;
    throw new Error(detail);
  }

  return payload as T;
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}
