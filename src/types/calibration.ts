export type CalibrationTargetType = "checkerboard" | "charuco" | "aprilgrid";
export type CameraModel = "pinhole" | "fisheye";
export type CalibrationStage = "setup" | "upload" | "review" | "calibrating" | "results";
export type CalibrationStatus = "idle" | "processing" | "complete" | "error";
export type CalibrationQuality = "poor" | "fair" | "good" | "excellent";
export type FrameStatus = "pending" | "accepted" | "rejected";
export type RejectionReason = "blurred" | "low-coverage" | "low-pose-diversity" | "high-reprojection-error" | "no-target-detected" | "manual-exclusion";

export interface ImageDimensions { width: number; height: number; }
export interface ImagePoint { x: number; y: number; }
export interface RotationVector { x: number; y: number; z: number; }
export interface TranslationVector { x: number; y: number; z: number; }
export interface BoundingBox { minX: number; minY: number; maxX: number; maxY: number; }

export interface CalibrationTargetConfig {
  type: CalibrationTargetType;
  columns: number;
  rows: number;
  squareSizeMm: number;
}

export interface CameraConfig {
  model: CameraModel;
  cameraName: string;
  frameId: string;
  imageSize: ImageDimensions;
}

export interface CalibrationSettings {
  target: CalibrationTargetConfig;
  camera: CameraConfig;
  minimumAcceptedFrames: number;
  enableTangentialDistortion: boolean;
  fixPrincipalPoint: boolean;
  fixAspectRatio: boolean;
  useIntrinsicGuess: boolean;
}

export interface FrameQualityMetrics {
  blurScore: number;
  coverageScore: number;
  poseDiversityScore: number;
  detectionConfidence: number;
  reprojectionError?: number;
}

export interface CalibrationFrame {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  sourceUrl: string;
  thumbnailUrl: string;
  dimensions: ImageDimensions;
  status: FrameStatus;
  targetDetected: boolean;
  detectedPoints: ImagePoint[];
  boardCenter?: ImagePoint;
  boardCoverage?: BoundingBox;
  estimatedRotation?: RotationVector;
  estimatedTranslation?: TranslationVector;
  metrics: FrameQualityMetrics;
  rejectionReasons: RejectionReason[];
  manuallyIncluded: boolean;
  capturedAt?: string;
}

export interface CoverageGridCell {
  row: number;
  column: number;
  score: number;
  observationCount: number;
}

export interface DatasetCoverage {
  rows: number;
  columns: number;
  overallScore: number;
  coveredAreaPercent: number;
  cells: CoverageGridCell[];
}

export interface DatasetSummary {
  totalFrames: number;
  acceptedFrames: number;
  rejectedFrames: number;
  pendingFrames: number;
  detectedFrames: number;
  averageBlurScore: number;
  averageCoverageScore: number;
  averagePoseDiversityScore: number;
  datasetCoverage: DatasetCoverage;
  quality: CalibrationQuality;
}

export type Matrix3x3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

export interface CameraIntrinsics {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  skew: number;
  cameraMatrix: Matrix3x3;
}

export interface PinholeDistortionCoefficients {
  model: "pinhole";
  k1: number;
  k2: number;
  p1: number;
  p2: number;
  k3: number;
}

export interface FisheyeDistortionCoefficients {
  model: "fisheye";
  k1: number;
  k2: number;
  k3: number;
  k4: number;
}

export type DistortionCoefficients = PinholeDistortionCoefficients | FisheyeDistortionCoefficients;

export interface FrameCalibrationResult {
  frameId: string;
  reprojectionError: number;
  rotation: RotationVector;
  translation: TranslationVector;
  projectedPoints: ImagePoint[];
  accepted: boolean;
}

export interface CalibrationStatistics {
  rmsError: number;
  meanReprojectionError: number;
  medianReprojectionError: number;
  maximumReprojectionError: number;
  minimumReprojectionError: number;
  standardDeviation: number;
}

export interface CalibrationResult {
  id: string;
  createdAt: string;
  camera: CameraConfig;
  target: CalibrationTargetConfig;
  imageSize: ImageDimensions;
  intrinsics: CameraIntrinsics;
  distortion: DistortionCoefficients;
  statistics: CalibrationStatistics;
  frames: FrameCalibrationResult[];
  acceptedFrameIds: string[];
  rejectedFrameIds: string[];
  quality: CalibrationQuality;
  calibrationDurationMs: number;
}

export interface CalibrationProgress {
  status: CalibrationStatus;
  stage: CalibrationStatus;
  progressPercent: number;
  message: string;
  processedFrames: number;
  totalFrames: number;
}

export interface UndistortionPreview {
  frameId: string;
  originalImageUrl: string;
  correctedImageUrl: string;
  generatedAt: string;
}

export interface CalibrationProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  stage: CalibrationStage;
  settings: CalibrationSettings;
  frames: CalibrationFrame[];
  datasetSummary?: DatasetSummary;
  progress: CalibrationProgress;
  result?: CalibrationResult;
  preview?: UndistortionPreview;
}
