import type {
  CalibrationFrame,
  CalibrationProject,
  CalibrationResult,
  CalibrationSettings,
  DatasetSummary,
  FrameCalibrationResult,
  ImagePoint,
  Matrix3x3,
  RejectionReason,
} from "../types/calibration";

const svgThumbnail = (label: string, accent = "#70f2c2") => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#071018"/><g transform="translate(145 78) rotate(-5 175 100)">${Array.from({ length: 54 }, (_, i) => { const r = Math.floor(i / 9); const c = i % 9; return `<rect x="${c * 39}" y="${r * 34}" width="39" height="34" fill="${(r + c) % 2 ? "#11171b" : "#edf2f2"}"/>`; }).join("")}</g><rect x="24" y="24" width="592" height="312" rx="18" fill="none" stroke="${accent}" stroke-opacity=".35"/><text x="30" y="330" fill="#c0c9cd" font-family="monospace" font-size="18">${label}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const createDetectedPoints = (columns: number, rows: number, offsetX: number, offsetY: number, spacingX: number, spacingY: number, skew = 0): ImagePoint[] => {
  const points: ImagePoint[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      points.push({ x: offsetX + column * spacingX + row * skew, y: offsetY + row * spacingY });
    }
  }
  return points;
};

export const mockCalibrationSettings: CalibrationSettings = {
  target: { type: "checkerboard", columns: 9, rows: 6, squareSizeMm: 25 },
  camera: { model: "pinhole", cameraName: "front_camera", frameId: "camera_optical_frame", imageSize: { width: 1280, height: 720 } },
  minimumAcceptedFrames: 12,
  enableTangentialDistortion: true,
  fixPrincipalPoint: false,
  fixAspectRatio: false,
  useIntrinsicGuess: false,
};

const seeds: Array<[string, "accepted" | "rejected", number, number, number, number, number, number, number, number, RejectionReason[]]> = [
  ["calibration_001.jpg", "accepted", 170, 120, 0.94, 0.82, 0.77, 0.99, 0.22, 0, []],
  ["calibration_002.jpg", "accepted", 520, 80, 0.90, 0.76, 0.84, 0.98, 0.27, -1.6, []],
  ["calibration_003.jpg", "accepted", 270, 320, 0.96, 0.88, 0.91, 0.99, 0.18, 1.1, []],
  ["calibration_004.jpg", "accepted", 690, 300, 0.88, 0.71, 0.86, 0.97, 0.31, -2.1, []],
  ["calibration_005.jpg", "accepted", 350, 190, 0.91, 0.81, 0.72, 0.98, 0.24, 0.7, []],
  ["calibration_006.jpg", "accepted", 750, 110, 0.89, 0.74, 0.89, 0.97, 0.29, -1.2, []],
  ["calibration_007.jpg", "accepted", 130, 280, 0.93, 0.79, 0.83, 0.99, 0.21, 2.0, []],
  ["calibration_008.jpg", "accepted", 610, 210, 0.92, 0.85, 0.93, 0.99, 0.20, -2.4, []],
  ["calibration_009.jpg", "accepted", 460, 350, 0.87, 0.73, 0.78, 0.97, 0.33, 1.5, []],
  ["calibration_010.jpg", "accepted", 210, 70, 0.95, 0.80, 0.88, 0.99, 0.19, 0.3, []],
  ["calibration_011.jpg", "accepted", 810, 260, 0.90, 0.77, 0.92, 0.98, 0.26, -1.8, []],
  ["calibration_012.jpg", "accepted", 390, 250, 0.89, 0.84, 0.81, 0.98, 0.23, 0.9, []],
  ["calibration_013.jpg", "rejected", 430, 210, 0.31, 0.42, 0.28, 0.91, 0.88, 0.4, ["blurred", "high-reprojection-error"]],
  ["calibration_014.jpg", "rejected", 510, 250, 0.84, 0.19, 0.22, 0.94, 0.64, 0.1, ["low-coverage", "low-pose-diversity"]],
  ["calibration_015.jpg", "rejected", 0, 0, 0.72, 0, 0, 0.08, 0, 0, ["no-target-detected"]],
];

export const mockCalibrationFrames: CalibrationFrame[] = seeds.map((seed, index) => {
  const [fileName, status, offsetX, offsetY, blur, coverage, diversity, confidence, error, skew, reasons] = seed;
  const detected = !reasons.includes("no-target-detected");
  const url = svgThumbnail(fileName, status === "accepted" ? "#70f2c2" : "#ff7474");
  return {
    id: `frame-${String(index + 1).padStart(3, "0")}`,
    fileName,
    fileSizeBytes: 1_800_000 + index * 93_421,
    mimeType: "image/jpeg",
    sourceUrl: url,
    thumbnailUrl: url,
    dimensions: { width: 1280, height: 720 },
    status,
    targetDetected: detected,
    detectedPoints: detected ? createDetectedPoints(9, 6, offsetX, offsetY, 49, 46, skew) : [],
    boardCenter: detected ? { x: Math.min(0.88, (offsetX + 220) / 1280), y: Math.min(0.88, (offsetY + 140) / 720) } : undefined,
    boardCoverage: detected ? { minX: offsetX / 1280, minY: offsetY / 720, maxX: Math.min(1, (offsetX + 440) / 1280), maxY: Math.min(1, (offsetY + 280) / 720) } : undefined,
    estimatedRotation: detected ? { x: (index - 7) * 0.025, y: (index % 4 - 1.5) * 0.08, z: skew * 0.02 } : undefined,
    estimatedTranslation: detected ? { x: (index % 5 - 2) * 0.09, y: (index % 3 - 1) * 0.11, z: 1.05 + index * 0.025 } : undefined,
    metrics: { blurScore: blur, coverageScore: coverage, poseDiversityScore: diversity, detectionConfidence: confidence, reprojectionError: detected ? error : undefined },
    rejectionReasons: reasons,
    manuallyIncluded: false,
    capturedAt: new Date(Date.now() - (15 - index) * 45_000).toISOString(),
  };
});

const coverageCells = Array.from({ length: 15 }, (_, i) => ({ row: Math.floor(i / 5), column: i % 5, score: [0.72, 0.84, 0.91, 0.77, 0.66, 0.82, 0.95, 0.98, 0.89, 0.79, 0.68, 0.81, 0.90, 0.85, 0.73][i], observationCount: 1 + (i * 3) % 5 }));

export const mockDatasetSummary: DatasetSummary = {
  totalFrames: mockCalibrationFrames.length,
  acceptedFrames: mockCalibrationFrames.filter((f) => f.status === "accepted").length,
  rejectedFrames: mockCalibrationFrames.filter((f) => f.status === "rejected").length,
  pendingFrames: 0,
  detectedFrames: mockCalibrationFrames.filter((f) => f.targetDetected).length,
  averageBlurScore: 0.84,
  averageCoverageScore: 0.70,
  averagePoseDiversityScore: 0.72,
  datasetCoverage: { rows: 3, columns: 5, overallScore: 0.84, coveredAreaPercent: 82, cells: coverageCells },
  quality: "good",
};

const cameraMatrix: Matrix3x3 = [[918.42, 0, 638.71], [0, 916.87, 361.29], [0, 0, 1]];
const frameResults: FrameCalibrationResult[] = mockCalibrationFrames.filter((f) => f.targetDetected).map((frame) => ({
  frameId: frame.id,
  reprojectionError: frame.metrics.reprojectionError ?? 0,
  rotation: frame.estimatedRotation ?? { x: 0, y: 0, z: 0 },
  translation: frame.estimatedTranslation ?? { x: 0, y: 0, z: 0 },
  projectedPoints: frame.detectedPoints.map((point) => ({ x: point.x + 0.14, y: point.y - 0.11 })),
  accepted: frame.status === "accepted",
}));

export const mockCalibrationResult: CalibrationResult = {
  id: "calibration-result-001",
  createdAt: new Date().toISOString(),
  camera: mockCalibrationSettings.camera,
  target: mockCalibrationSettings.target,
  imageSize: { width: 1280, height: 720 },
  intrinsics: { fx: 918.42, fy: 916.87, cx: 638.71, cy: 361.29, skew: 0, cameraMatrix },
  distortion: { model: "pinhole", k1: -0.2143, k2: 0.0831, p1: 0.0007, p2: -0.0012, k3: -0.0194 },
  statistics: { rmsError: 0.31, meanReprojectionError: 0.27, medianReprojectionError: 0.25, maximumReprojectionError: 0.88, minimumReprojectionError: 0.18, standardDeviation: 0.11 },
  frames: frameResults,
  acceptedFrameIds: mockCalibrationFrames.filter((f) => f.status === "accepted").map((f) => f.id),
  rejectedFrameIds: mockCalibrationFrames.filter((f) => f.status === "rejected").map((f) => f.id),
  quality: "good",
  calibrationDurationMs: 1842,
};

export const mockCalibrationProject: CalibrationProject = {
  id: "project-001",
  name: "Front Camera Calibration",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  stage: "results",
  settings: mockCalibrationSettings,
  frames: mockCalibrationFrames,
  datasetSummary: mockDatasetSummary,
  progress: { status: "complete", stage: "complete", progressPercent: 100, message: "Calibration completed successfully.", processedFrames: mockCalibrationFrames.length, totalFrames: mockCalibrationFrames.length },
  result: mockCalibrationResult,
  preview: { frameId: "frame-003", originalImageUrl: mockCalibrationFrames[2].sourceUrl, correctedImageUrl: mockCalibrationFrames[2].sourceUrl, generatedAt: new Date().toISOString() },
};
