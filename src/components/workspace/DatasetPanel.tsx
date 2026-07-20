import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Grid3X3,
  Loader2,
  RefreshCw,
  ScanLine,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";

import {
  analyzeCalibrationDataset,
  isDatasetReady,
  setFrameIncluded,
} from "../../lib/opencvPipeline";
import type {
  CalibrationFrame,
  CalibrationProject,
  RejectionReason,
} from "../../types/calibration";

type DatasetPanelProps = {
  project: CalibrationProject;
  onChange: (project: CalibrationProject) => void;
};

type DatasetFilter = "all" | "accepted" | "rejected";

const reasonLabels: Record<RejectionReason, string> = {
  blurred: "Blurred",
  "low-coverage": "Low coverage",
  "low-pose-diversity": "Similar pose",
  "high-reprojection-error": "High error",
  "no-target-detected": "Target missing",
  "manual-exclusion": "Excluded manually",
};

function DatasetPanel({ project, onChange }: DatasetPanelProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [filter, setFilter] = useState<DatasetFilter>("all");
  const summary = project.datasetSummary;
  const ready = isDatasetReady(project);
  const hasAnalysis = Boolean(summary && summary.pendingFrames === 0);

  const visibleFrames = useMemo(() => {
    if (filter === "all") {
      return project.frames;
    }

    return project.frames.filter((frame) => frame.status === filter);
  }, [filter, project.frames]);

  const [analysisMessage, setAnalysisMessage] = useState("Ready to connect to the local OpenCV calibration engine.");
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const runAnalysis = async () => {
    if (isAnalyzing || project.frames.length === 0) {
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(1);
    setAnalysisError(null);
    setAnalysisMessage("Connecting to the local OpenCV calibration engine...");

    try {
      const analysis = await analyzeCalibrationDataset(
        project,
        (processed, total, message) => {
          setAnalysisProgress(Math.max(2, Math.round((processed / Math.max(total, 1)) * 100)));
          setAnalysisMessage(message);
        },
      );

      onChange({
        ...project,
        frames: analysis.frames,
        datasetSummary: analysis.summary,
        result: undefined,
        preview: undefined,
        progress: {
          status: "complete",
          stage: "complete",
          progressPercent: 100,
          message: "Native checkerboard analysis complete.",
          processedFrames: analysis.frames.length,
          totalFrames: analysis.frames.length,
        },
        updatedAt: new Date().toISOString(),
      });
      setAnalysisProgress(100);
      setAnalysisMessage("Checkerboard detection complete.");
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Dataset analysis failed.";
      setAnalysisError(message);
      setAnalysisMessage("Analysis stopped.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleFrame = (frame: CalibrationFrame) => {
    onChange(setFrameIncluded(project, frame.id, frame.status !== "accepted"));
  };

  return (
    <div className="dataset-panel">
      <section className="stage-card dataset-hero-card">
        <div className="stage-card__heading">
          <span className="stage-icon"><ScanLine size={21} /></span>
          <div>
            <span className="label">Dataset analysis</span>
            <h2>Inspect image quality before calibration</h2>
            <p>
              The local Python OpenCV engine runs native findChessboardCornersSB detection on the actual image pixels. Corner overlays, sharpness, board coverage and acceptance decisions come from the uploaded frames.
            </p>
          </div>
        </div>

        <div className="dataset-hero-card__actions">
          <button className="button button-primary" type="button" onClick={runAnalysis} disabled={isAnalyzing}>
            {isAnalyzing ? <Loader2 className="stage-spinner" size={17} /> : <Activity size={17} />}
            {hasAnalysis ? "Analyze again" : "Analyze dataset"}
          </button>

          <span className={`readiness-pill ${ready ? "readiness-pill--ready" : ""}`}>
            {ready ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            {ready ? "Ready to calibrate" : "Analysis required"}
          </span>
        </div>

        {(isAnalyzing || analysisError) && (
          <div className="dataset-analysis-status">
            {isAnalyzing && (
              <div className="stage-progress stage-progress--wide">
                <span style={{ width: `${analysisProgress}%` }} />
              </div>
            )}
            <span className={analysisError ? "dataset-analysis-status__error" : ""}>
              {analysisError ?? analysisMessage}
            </span>
          </div>
        )}
      </section>

      <div className="dataset-layout">
        <div className="dataset-main-column">
          <section className="stage-card">
            <div className="stage-card__toolbar">
              <div>
                <span className="label">Frame review</span>
                <h3>{visibleFrames.length} visible frames</h3>
              </div>

              <div className="segmented-control" aria-label="Filter frames">
                {(["all", "accepted", "rejected"] as DatasetFilter[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={filter === item ? "active" : ""}
                    onClick={() => setFilter(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {!hasAnalysis ? (
              <div className="stage-empty-state">
                <ScanLine size={34} />
                <h3>Frames are waiting for analysis</h3>
                <p>Run the dataset pass to generate corner detections, sharpness scores, board coverage and pose diversity.</p>
                <button className="button button-secondary" type="button" onClick={runAnalysis} disabled={isAnalyzing}>
                  <Activity size={16} />
                  Start analysis
                </button>
              </div>
            ) : (
              <div className="dataset-frame-grid">
                {visibleFrames.map((frame, index) => (
                  <DatasetFrameCard
                    key={frame.id}
                    frame={frame}
                    index={project.frames.findIndex((item) => item.id === frame.id)}
                    onToggle={() => toggleFrame(frame)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="dataset-sidebar">
          <SummaryCard project={project} />
          <CoverageCard project={project} />
          <QualityCard project={project} />
        </aside>
      </div>
    </div>
  );
}

function DatasetFrameCard({
  frame,
  index,
  onToggle,
}: {
  frame: CalibrationFrame;
  index: number;
  onToggle: () => void;
}) {
  const accepted = frame.status === "accepted";

  return (
    <article className={`dataset-frame ${accepted ? "dataset-frame--accepted" : "dataset-frame--rejected"}`}>
      <div className="dataset-frame__preview">
        <img src={frame.thumbnailUrl || frame.sourceUrl} alt={frame.fileName} />

        {frame.targetDetected && (
          <div className="corner-overlay" aria-hidden="true">
            {frame.detectedPoints.map((point, pointIndex) => (
              <span
                key={`${frame.id}-${pointIndex}`}
                style={{
                  left: `${(point.x / frame.dimensions.width) * 100}%`,
                  top: `${(point.y / frame.dimensions.height) * 100}%`,
                }}
              />
            ))}
          </div>
        )}

        <span className="dataset-frame__index">{String(index + 1).padStart(2, "0")}</span>
        <span className={`frame-status ${accepted ? "frame-status--accepted" : "frame-status--rejected"}`}>
          {accepted ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
          {accepted ? "Accepted" : "Rejected"}
        </span>
      </div>

      <div className="dataset-frame__body">
        <strong title={frame.fileName}>{frame.fileName}</strong>

        <div className="quality-bars">
          <QualityBar label="Sharpness" value={frame.metrics.blurScore} />
          <QualityBar label="Coverage" value={frame.metrics.coverageScore} />
          <QualityBar label="Pose" value={frame.metrics.poseDiversityScore} />
        </div>

        <div className="dataset-frame__footer">
          <div className="reason-list">
            {frame.rejectionReasons.length === 0 ? (
              <span className="reason-chip reason-chip--positive">Clean frame</span>
            ) : (
              frame.rejectionReasons.slice(0, 2).map((reason) => (
                <span className="reason-chip" key={reason}>{reasonLabels[reason]}</span>
              ))
            )}
          </div>

          <button
            className="text-button"
            type="button"
            onClick={onToggle}
            disabled={!accepted && !frame.targetDetected}
            title={!accepted && !frame.targetDetected ? "A frame without a detected target cannot be included." : undefined}
          >
            {accepted ? "Exclude" : "Include"}
          </button>
        </div>
      </div>
    </article>
  );
}

function QualityBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="quality-bar">
      <div><span>{label}</span><strong>{Math.round(value * 100)}%</strong></div>
      <div className="quality-bar__track"><span style={{ width: `${value * 100}%` }} /></div>
    </div>
  );
}

function SummaryCard({ project }: { project: CalibrationProject }) {
  const summary = project.datasetSummary;
  const required = project.settings.minimumAcceptedFrames;
  const accepted = summary?.acceptedFrames ?? 0;

  return (
    <section className="stage-card compact-card">
      <div className="compact-card__header">
        <span className="label">Dataset readiness</span>
        <SlidersHorizontal size={17} />
      </div>
      <div className="large-counter"><strong>{accepted}</strong><span>/ {required} required</span></div>
      <div className="stage-progress"><span style={{ width: `${Math.min(100, (accepted / Math.max(required, 1)) * 100)}%` }} /></div>
      <div className="metric-list">
        <MetricRow label="Accepted" value={String(accepted)} positive />
        <MetricRow label="Rejected" value={String(summary?.rejectedFrames ?? 0)} warning />
        <MetricRow label="Target detected" value={String(summary?.detectedFrames ?? 0)} />
        <MetricRow label="Dataset quality" value={summary?.quality ?? "Pending"} />
      </div>
    </section>
  );
}

function CoverageCard({ project }: { project: CalibrationProject }) {
  const coverage = project.datasetSummary?.datasetCoverage;

  return (
    <section className="stage-card compact-card">
      <div className="compact-card__header">
        <div><span className="label">Image coverage</span><h3>{coverage ? `${coverage.coveredAreaPercent}% covered` : "Not analyzed"}</h3></div>
        <Grid3X3 size={18} />
      </div>
      <div
        className="coverage-grid"
        style={{
          gridTemplateColumns: `repeat(${coverage?.columns ?? 6}, 1fr)`,
        }}
      >
        {(coverage?.cells ?? Array.from({ length: 24 }, (_, index) => ({ row: Math.floor(index / 6), column: index % 6, score: 0, observationCount: 0 }))).map((cell) => (
          <span
            key={`${cell.row}-${cell.column}`}
            title={`${cell.observationCount} observation${cell.observationCount === 1 ? "" : "s"}`}
            style={{ "--cell-score": cell.score } as CSSProperties}
          >
            {cell.observationCount || ""}
          </span>
        ))}
      </div>
      <p className="compact-note">Move the checkerboard through corners and edges to fill sparse cells.</p>
    </section>
  );
}

function QualityCard({ project }: { project: CalibrationProject }) {
  const summary = project.datasetSummary;

  return (
    <section className="stage-card compact-card">
      <div className="compact-card__header">
        <span className="label">Average quality</span>
        <Eye size={17} />
      </div>
      <QualityBar label="Sharpness" value={summary?.averageBlurScore ?? 0} />
      <QualityBar label="Board coverage" value={summary?.averageCoverageScore ?? 0} />
      <QualityBar label="Pose diversity" value={summary?.averagePoseDiversityScore ?? 0} />
      <button className="button button-secondary compact-button" type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        <RefreshCw size={15} />
        Review guidance
      </button>
    </section>
  );
}

function MetricRow({
  label,
  value,
  positive = false,
  warning = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="metric-row">
      <span>{label}</span>
      <strong className={positive ? "positive" : warning ? "warning" : ""}>{value}</strong>
    </div>
  );
}

export default DatasetPanel;
