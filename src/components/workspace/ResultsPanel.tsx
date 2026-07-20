import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  BarChart3,
  Check,
  Clipboard,
  Download,
  FileCode2,
  FileJson,
  Gauge,
  Image as ImageIcon,
  Rows3,
  Sparkles,
} from "lucide-react";

import type { CalibrationProject, CalibrationResult } from "../../types/calibration";

type ResultsPanelProps = {
  project: CalibrationProject;
};

type ExportKind = "opencv" | "ros" | "kalibr" | "report";

function ResultsPanel({ project }: ResultsPanelProps) {
  const result = project.result;
  const [selectedFrameId, setSelectedFrameId] = useState(
    project.preview?.frameId ?? result?.acceptedFrameIds[0] ?? project.frames[0]?.id ?? "",
  );
  const [copied, setCopied] = useState(false);

  const selectedFrame = useMemo(
    () => project.frames.find((frame) => frame.id === selectedFrameId) ?? project.frames[0],
    [project.frames, selectedFrameId],
  );

  if (!result) {
    return (
      <div className="stage-empty-state results-empty-state">
        <Gauge size={38} />
        <h2>No calibration result yet</h2>
        <p>Return to the Calibration stage and run the solver before opening Results.</p>
      </div>
    );
  }

  const removedOutliers = project.frames.filter((frame) =>
    frame.rejectionReasons.includes("high-reprojection-error"),
  ).length;
  const distortionEntries = Object.entries(result.distortion).filter(([key]) => key !== "model");
  const maximumFrameError = Math.max(...result.frames.map((frame) => frame.reprojectionError), 0.01);
  const correctedPreview =
    project.preview?.frameId === selectedFrame?.id
      ? project.preview.correctedImageUrl
      : undefined;

  const copyCameraMatrix = async () => {
    const matrixText = result.intrinsics.cameraMatrix.map((row) => row.join("  ")).join("\n");
    await navigator.clipboard.writeText(matrixText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="results-panel">
      <section className="results-summary stage-card">
        <div>
          <span className="results-quality-icon"><Sparkles size={24} /></span>
          <div><span className="label">Calibration result</span><h2>{capitalize(result.quality)} camera model</h2><p>Generated from {result.acceptedFrameIds.length} accepted frames in {(result.calibrationDurationMs / 1000).toFixed(2)} seconds.{removedOutliers > 0 ? ` ${removedOutliers} high-error frame${removedOutliers === 1 ? " was" : "s were"} removed automatically.` : ""}</p></div>
        </div>

        <div className="results-rms">
          <span>RMS reprojection error</span>
          <strong>{result.statistics.rmsError.toFixed(3)}</strong>
          <small>pixels</small>
        </div>
      </section>

      <div className="results-metric-grid">
        <ResultMetric label="Focal length X" value={result.intrinsics.fx.toFixed(2)} unit="px" />
        <ResultMetric label="Focal length Y" value={result.intrinsics.fy.toFixed(2)} unit="px" />
        <ResultMetric label="Principal point X" value={result.intrinsics.cx.toFixed(2)} unit="px" />
        <ResultMetric label="Principal point Y" value={result.intrinsics.cy.toFixed(2)} unit="px" />
      </div>

      <div className="results-main-grid">
        <section className="stage-card results-matrix-card">
          <div className="stage-card__toolbar">
            <div><span className="label">Camera intrinsics</span><h3>Camera matrix K</h3></div>
            <button className="button button-secondary compact-button" type="button" onClick={copyCameraMatrix}>
              {copied ? <Check size={15} /> : <Clipboard size={15} />}
              {copied ? "Copied" : "Copy matrix"}
            </button>
          </div>

          <div className="camera-matrix" aria-label="Camera matrix">
            {result.intrinsics.cameraMatrix.flatMap((row, rowIndex) =>
              row.map((value, columnIndex) => (
                <span key={`${rowIndex}-${columnIndex}`} className={value !== 0 ? "camera-matrix__value" : ""}>{value.toFixed(value === 0 || value === 1 ? 0 : 3)}</span>
              )),
            )}
          </div>

          <div className="distortion-grid">
            {distortionEntries.map(([key, value]) => (
              <div key={key}><span>{key}</span><strong>{Number(value).toFixed(6)}</strong></div>
            ))}
          </div>
        </section>

        <section className="stage-card results-error-card">
          <div className="stage-card__toolbar">
            <div><span className="label">Frame diagnostics</span><h3>Reprojection error</h3></div>
            <BarChart3 size={18} />
          </div>

          <div className="error-chart">
            {result.frames.map((frameResult, index) => {
              const sourceFrame = project.frames.find((frame) => frame.id === frameResult.frameId);
              return (
                <div className="error-row" key={frameResult.frameId}>
                  <span title={sourceFrame?.fileName}>#{String(index + 1).padStart(2, "0")}</span>
                  <div><span style={{ width: `${(frameResult.reprojectionError / maximumFrameError) * 100}%` }} /></div>
                  <strong>{frameResult.reprojectionError.toFixed(3)}</strong>
                </div>
              );
            })}
          </div>

          <div className="result-stat-strip">
            <ResultStat label="Mean" value={result.statistics.meanReprojectionError} />
            <ResultStat label="Median" value={result.statistics.medianReprojectionError} />
            <ResultStat label="Maximum" value={result.statistics.maximumReprojectionError} />
            <ResultStat label="Std. dev." value={result.statistics.standardDeviation} />
          </div>
        </section>
      </div>

      <section className="stage-card preview-card">
        <div className="stage-card__toolbar">
          <div><span className="label">Undistortion preview</span><h3>Original and corrected view</h3></div>
          <select className="results-select" value={selectedFrame?.id ?? ""} onChange={(event) => setSelectedFrameId(event.target.value)}>
            {project.frames.filter((frame) => result.acceptedFrameIds.includes(frame.id)).map((frame) => <option value={frame.id} key={frame.id}>{frame.fileName}</option>)}
          </select>
        </div>

        <div className="preview-comparison">
          <PreviewImage label="Original" source={selectedFrame?.sourceUrl} />
          <PreviewImage label="Undistorted" source={correctedPreview} corrected />
        </div>
        <p className="preview-disclaimer">
          The real undistortion preview is generated for the solver preview frame. Select that frame to compare the original and remapped image.
        </p>
      </section>

      <section className="stage-card export-section">
        <div className="stage-card__toolbar"><div><span className="label">Export calibration</span><h3>Use the result in your vision stack</h3></div><Download size={19} /></div>
        <div className="export-grid">
          <ExportCard icon={<FileJson size={21} />} title="OpenCV JSON" description="Camera matrix, distortion vector and image size." onClick={() => downloadExport(project, result, "opencv")} />
          <ExportCard icon={<Rows3 size={21} />} title="ROS camera_info" description="YAML formatted for ROS camera_info workflows." onClick={() => downloadExport(project, result, "ros")} />
          <ExportCard icon={<FileCode2 size={21} />} title="Kalibr YAML" description="Intrinsics and distortion model for Kalibr." onClick={() => downloadExport(project, result, "kalibr")} />
          <ExportCard icon={<ImageIcon size={21} />} title="Full report" description="Complete project and per-frame diagnostics as JSON." onClick={() => downloadExport(project, result, "report")} />
        </div>
      </section>
    </div>
  );
}

function ResultMetric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return <div className="result-metric stage-card"><span>{label}</span><strong>{value}</strong><small>{unit}</small></div>;
}

function ResultStat({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><strong>{value.toFixed(3)} px</strong></div>;
}

function PreviewImage({ label, source, corrected = false }: { label: string; source?: string; corrected?: boolean }) {
  return (
    <div className={`preview-image ${corrected ? "preview-image--corrected" : ""}`}>
      <span>{label}</span>
      {source ? <img src={source} alt={label} /> : <div className="preview-image__empty">No preview image</div>}
      <div className="preview-grid-overlay" />
    </div>
  );
}

function ExportCard({ icon, title, description, onClick }: { icon: ReactNode; title: string; description: string; onClick: () => void }) {
  return (
    <button className="export-card" type="button" onClick={onClick}>
      <span>{icon}</span>
      <div><strong>{title}</strong><small>{description}</small></div>
      <Download size={16} />
    </button>
  );
}

function downloadExport(project: CalibrationProject, result: CalibrationResult, kind: ExportKind) {
  const cameraName = project.settings.camera.cameraName || "camera";
  let contents = "";
  let fileName = "";
  let mimeType = "text/plain";

  if (kind === "opencv") {
    contents = JSON.stringify({
      camera_name: cameraName,
      image_width: result.imageSize.width,
      image_height: result.imageSize.height,
      camera_model: result.camera.model,
      camera_matrix: result.intrinsics.cameraMatrix,
      distortion_coefficients: result.distortion,
      rms_reprojection_error: result.statistics.rmsError,
    }, null, 2);
    fileName = `${cameraName}-opencv.json`;
    mimeType = "application/json";
  } else if (kind === "ros") {
    const coefficients = Object.entries(result.distortion).filter(([key]) => key !== "model").map(([, value]) => value);
    contents = `%YAML:1.0\nimage_width: ${result.imageSize.width}\nimage_height: ${result.imageSize.height}\ncamera_name: ${cameraName}\ncamera_matrix:\n  rows: 3\n  cols: 3\n  data: [${result.intrinsics.cameraMatrix.flat().join(", ")}]\ndistortion_model: ${result.camera.model === "fisheye" ? "equidistant" : "plumb_bob"}\ndistortion_coefficients:\n  rows: 1\n  cols: ${coefficients.length}\n  data: [${coefficients.join(", ")}]\nrectification_matrix:\n  rows: 3\n  cols: 3\n  data: [1, 0, 0, 0, 1, 0, 0, 0, 1]\nprojection_matrix:\n  rows: 3\n  cols: 4\n  data: [${result.intrinsics.fx}, 0, ${result.intrinsics.cx}, 0, 0, ${result.intrinsics.fy}, ${result.intrinsics.cy}, 0, 0, 0, 1, 0]\n`;
    fileName = `${cameraName}-camera-info.yaml`;
    mimeType = "application/x-yaml";
  } else if (kind === "kalibr") {
    const coefficients = Object.entries(result.distortion).filter(([key]) => key !== "model").map(([, value]) => value);
    contents = `cam0:\n  camera_model: ${result.camera.model === "fisheye" ? "pinhole" : result.camera.model}\n  intrinsics: [${result.intrinsics.fx}, ${result.intrinsics.fy}, ${result.intrinsics.cx}, ${result.intrinsics.cy}]\n  distortion_model: ${result.camera.model === "fisheye" ? "equidistant" : "radtan"}\n  distortion_coeffs: [${coefficients.join(", ")}]\n  resolution: [${result.imageSize.width}, ${result.imageSize.height}]\n  rostopic: /${cameraName}/image_raw\n`;
    fileName = `${cameraName}-kalibr.yaml`;
    mimeType = "application/x-yaml";
  } else {
    contents = JSON.stringify({
      project: {
        id: project.id,
        name: project.name,
        settings: project.settings,
        datasetSummary: project.datasetSummary,
      },
      result,
      frames: project.frames.map((frame) => ({
        id: frame.id,
        fileName: frame.fileName,
        status: frame.status,
        metrics: frame.metrics,
        rejectionReasons: frame.rejectionReasons,
      })),
    }, null, 2);
    fileName = `${cameraName}-calibration-report.json`;
    mimeType = "application/json";
  }

  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default ResultsPanel;
