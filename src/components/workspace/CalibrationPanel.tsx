import { useMemo, useState } from "react";
import {
  Activity,
  Check,
  CheckCircle2,
  Cpu,
  Gauge,
  Loader2,
  Play,
  RefreshCw,
  ScanLine,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { runOpenCvCalibration } from "../../lib/opencvPipeline";
import type { CalibrationProject } from "../../types/calibration";

type CalibrationPanelProps = {
  project: CalibrationProject;
  onChange: (project: CalibrationProject) => void;
};

const solverSteps = [
  { threshold: 18, label: "Build 3D-to-2D correspondences", icon: ScanLine },
  { threshold: 35, label: "Initialize camera matrix", icon: Cpu },
  { threshold: 62, label: "Optimize lens parameters", icon: Activity },
  { threshold: 86, label: "Measure reprojection error", icon: Gauge },
  { threshold: 100, label: "Generate undistortion preview", icon: Sparkles },
];

function CalibrationPanel({ project, onChange }: CalibrationPanelProps) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(project.result ? 100 : 0);
  const [statusMessage, setStatusMessage] = useState(
    project.result ? "Calibration completed successfully." : "Ready to run robust native OpenCV calibration.",
  );
  const [error, setError] = useState<string | null>(null);

  const expectedPointCount =
    project.settings.target.columns * project.settings.target.rows;

  const acceptedFrames = useMemo(
    () =>
      project.frames.filter(
        (frame) =>
          frame.status === "accepted" &&
          frame.targetDetected &&
          frame.detectedPoints.length === expectedPointCount,
      ),
    [expectedPointCount, project.frames],
  );

  const runCalibration = async () => {
    if (running || acceptedFrames.length === 0) {
      return;
    }

    setRunning(true);
    setProgress(2);
    setError(null);
    setStatusMessage("Connecting to the local OpenCV calibration engine...");

    onChange({
      ...project,
      result: undefined,
      preview: undefined,
      progress: {
        status: "processing",
        stage: "processing",
        progressPercent: 2,
        message: "Connecting to the local OpenCV calibration engine.",
        processedFrames: 0,
        totalFrames: acceptedFrames.length,
      },
      updatedAt: new Date().toISOString(),
    });

    try {
      const output = await runOpenCvCalibration(
        project,
        (processed, total, message) => {
          const nextProgress = Math.max(
            2,
            Math.min(99, Math.round((processed / Math.max(1, total)) * 100)),
          );
          setProgress(nextProgress);
          setStatusMessage(message);
        },
      );

      setProgress(100);
      const prunedFrames = output.frames.filter(
        (frame) => frame.rejectionReasons.includes("high-reprojection-error"),
      ).length;
      const completionMessage = prunedFrames > 0
        ? `Calibration completed after removing ${prunedFrames} high-error frame${prunedFrames === 1 ? "" : "s"}.`
        : "Calibration completed successfully.";

      setStatusMessage(completionMessage);
      onChange({
        ...project,
        frames: output.frames,
        datasetSummary: output.summary,
        result: output.result,
        preview: output.preview,
        progress: {
          status: "complete",
          stage: "complete",
          progressPercent: 100,
          message: completionMessage,
          processedFrames: output.result.acceptedFrameIds.length,
          totalFrames: acceptedFrames.length,
        },
        updatedAt: new Date().toISOString(),
      });
    } catch (caughtError) {
      console.error(caughtError);
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Calibration failed unexpectedly.";
      setError(message);
      setStatusMessage("Calibration stopped.");
      setProgress(0);
      onChange({
        ...project,
        result: undefined,
        preview: undefined,
        progress: {
          status: "error",
          stage: "error",
          progressPercent: 0,
          message,
          processedFrames: 0,
          totalFrames: acceptedFrames.length,
        },
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setRunning(false);
    }
  };

  const completed = Boolean(project.result) && !running;
  const currentStep = Math.max(
    0,
    solverSteps.findIndex((step) => progress <= step.threshold),
  );

  return (
    <div className="calibration-panel">
      <section className="stage-card calibration-run-card">
        <div className="calibration-run-card__content">
          <span
            className={`calibration-orb ${
              running
                ? "calibration-orb--running"
                : completed
                  ? "calibration-orb--complete"
                  : ""
            }`}
          >
            {running ? (
              <Loader2 size={36} />
            ) : completed ? (
              <CheckCircle2 size={36} />
            ) : (
              <Cpu size={36} />
            )}
          </span>

          <span className="label">Local OpenCV calibration solver</span>
          <h2>
            {running
              ? "Estimating camera parameters"
              : completed
                ? "Calibration complete"
                : "Ready to solve"}
          </h2>
          <p>
            {running
              ? statusMessage
              : completed
                ? "Review the measured intrinsics, distortion coefficients and per-frame reprojection errors in Results."
                : `Use ${acceptedFrames.length} accepted checkerboard observations to estimate a real pinhole camera model with the local native solver.`}
          </p>

          <div className="calibration-progress-number">{Math.round(progress)}%</div>
          <div className="stage-progress calibration-progress">
            <span style={{ width: `${progress}%` }} />
          </div>

          {error && (
            <div className="calibration-error" role="alert">
              <TriangleAlert size={17} />
              <span>{error}</span>
            </div>
          )}

          <button
            className={`button ${completed ? "button-secondary" : "button-primary"}`}
            type="button"
            onClick={runCalibration}
            disabled={running || acceptedFrames.length === 0}
          >
            {completed ? <RefreshCw size={17} /> : <Play size={17} />}
            {completed ? "Run again" : running ? "Calibrating..." : "Run calibration"}
          </button>
        </div>

        <div className="calibration-run-card__visual" aria-hidden="true">
          <div className="solver-ring solver-ring--outer" />
          <div className="solver-ring solver-ring--middle" />
          <div className="solver-ring solver-ring--inner" />
          <div className="solver-core"><ApertureLike /></div>
        </div>
      </section>

      <div className="calibration-grid">
        <section className="stage-card">
          <div className="stage-card__toolbar">
            <div>
              <span className="label">Solver pipeline</span>
              <h3>Optimization stages</h3>
            </div>
            <span className="prototype-badge prototype-badge--real">OpenCV WASM</span>
          </div>

          <div className="solver-step-list">
            {solverSteps.map((step, index) => {
              const StepIcon = step.icon;
              const done = progress >= step.threshold;
              const active = running && index === currentStep;

              return (
                <div
                  className={`solver-step ${done ? "solver-step--done" : ""} ${
                    active ? "solver-step--active" : ""
                  }`}
                  key={step.label}
                >
                  <span className="solver-step__icon">
                    {done ? <Check size={16} /> : <StepIcon size={17} />}
                  </span>
                  <div>
                    <strong>{step.label}</strong>
                    <small>{done ? "Completed" : active ? "Processing" : "Waiting"}</small>
                  </div>
                  <span>{step.threshold}%</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="stage-card compact-card">
          <div className="compact-card__header">
            <span className="label">Solver input</span>
            <ScanLine size={18} />
          </div>
          <div className="metric-list metric-list--large">
            <Metric label="Accepted frames" value={String(acceptedFrames.length)} />
            <Metric label="Inner corners per frame" value={String(expectedPointCount)} />
            <Metric label="Camera model" value={project.settings.camera.model} />
            <Metric
              label="Resolution"
              value={`${project.settings.camera.imageSize.width} × ${project.settings.camera.imageSize.height}`}
            />
            <Metric
              label="Tangential terms"
              value={project.settings.enableTangentialDistortion ? "Enabled" : "Disabled"}
            />
          </div>
        </section>
      </div>

      {completed && project.result && (
        <section className="calibration-complete-strip">
          <CheckCircle2 size={21} />
          <div>
            <strong>{project.result.quality} calibration</strong>
            <span>
              RMS reprojection error: {project.result.statistics.rmsError.toFixed(3)} px
            </span>
          </div>
          <span>Continue to Results</span>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric-row"><span>{label}</span><strong>{value}</strong></div>;
}

function ApertureLike() {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="Calibration aperture">
      <circle cx="32" cy="32" r="25" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M32 7 44 27 32 32 18 14Z" fill="currentColor" opacity=".8" />
      <path d="M57 32 37 44 32 32 50 18Z" fill="currentColor" opacity=".65" />
      <path d="M32 57 20 37 32 32 46 50Z" fill="currentColor" opacity=".8" />
      <path d="M7 32 27 20 32 32 14 46Z" fill="currentColor" opacity=".65" />
    </svg>
  );
}

export default CalibrationPanel;
