// Backward-compatible exports. The application now uses the real browser-side
// OpenCV pipeline; this file remains only so older imports do not break.
export {
  analyzeCalibrationDataset,
  isDatasetReady,
  runOpenCvCalibration,
  setFrameIncluded,
  summarizeDataset,
} from "./opencvPipeline";
