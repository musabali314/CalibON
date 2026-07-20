import { useMemo, useState } from "react";
import {
  Aperture,
  ArrowLeft,
  ArrowRight,
  Check,
  Code2,
  Grid3X3,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";

import Hero from "./components/landing/Hero";
import CalibrationPanel from "./components/workspace/CalibrationPanel";
import DatasetPanel from "./components/workspace/DatasetPanel";
import ResultsPanel from "./components/workspace/ResultsPanel";
import SetupPanel, { isSetupValid } from "./components/workspace/SetupPanel";
import UploadPanel, { isUploadValid } from "./components/workspace/UploadPanel";
import {
  mockCalibrationProject,
  mockCalibrationSettings,
} from "./data/mockCalibration";
import { isDatasetReady } from "./lib/opencvPipeline";
import "./styles/workflow.css";
import type {
  CalibrationProject,
  CalibrationStage,
} from "./types/calibration";

const stages: Array<{
  id: CalibrationStage;
  label: string;
  description: string;
}> = [
  { id: "setup", label: "Setup", description: "Configure camera and target." },
  { id: "upload", label: "Images", description: "Upload or capture frames." },
  { id: "review", label: "Dataset", description: "Review coverage and quality." },
  { id: "calibrating", label: "Calibration", description: "Estimate camera parameters." },
  { id: "results", label: "Results", description: "Inspect and export calibration." },
];

function createProjectId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `project-${Date.now()}`;
}

function cloneDefaultSettings() {
  return {
    ...mockCalibrationSettings,
    camera: {
      ...mockCalibrationSettings.camera,
      imageSize: { ...mockCalibrationSettings.camera.imageSize },
    },
    target: { ...mockCalibrationSettings.target },
  };
}

function freshProject(): CalibrationProject {
  const now = new Date().toISOString();

  return {
    id: createProjectId(),
    name: "Untitled Camera Calibration",
    createdAt: now,
    updatedAt: now,
    stage: "setup",
    settings: cloneDefaultSettings(),
    frames: [],
    progress: {
      status: "idle",
      stage: "idle",
      progressPercent: 0,
      message: "Ready to begin.",
      processedFrames: 0,
      totalFrames: 0,
    },
  };
}

function App() {
  const [view, setView] = useState<"landing" | "workspace">("landing");
  const [project, setProject] = useState<CalibrationProject>(freshProject);

  const stageIndex = useMemo(
    () => stages.findIndex((stage) => stage.id === project.stage),
    [project.stage],
  );

  const setStage = (stage: CalibrationStage) => {
    const requestedStageIndex = stages.findIndex((item) => item.id === stage);

    if (requestedStageIndex > 0 && !isSetupValid(project)) {
      return;
    }

    if (requestedStageIndex > 1 && !isUploadValid(project)) {
      return;
    }

    if (requestedStageIndex > 2 && !isDatasetReady(project)) {
      return;
    }

    if (requestedStageIndex > 3 && !project.result) {
      return;
    }

    setProject((current) => ({
      ...current,
      stage,
      updatedAt: new Date().toISOString(),
    }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const launchNewProject = () => {
    setProject(freshProject());
    setView("workspace");
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const openDemoProject = () => {
    setProject({
      ...mockCalibrationProject,
      settings: {
        ...mockCalibrationProject.settings,
        camera: {
          ...mockCalibrationProject.settings.camera,
          imageSize: { ...mockCalibrationProject.settings.camera.imageSize },
        },
        target: { ...mockCalibrationProject.settings.target },
      },
      frames: mockCalibrationProject.frames.map((frame) => ({
        ...frame,
        detectedPoints: frame.detectedPoints.map((point) => ({ ...point })),
        metrics: { ...frame.metrics },
        rejectionReasons: [...frame.rejectionReasons],
      })),
      updatedAt: new Date().toISOString(),
    });
    setView("workspace");
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  if (view === "workspace") {
    return (
      <Workspace
        project={project}
        stageIndex={stageIndex}
        setStage={setStage}
        setProject={setProject}
        onBack={() => setView("landing")}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="landing-header">
        <div className="page-container landing-header__inner">
          <a className="brand" href="#top">
            <span className="brand__mark"><Aperture size={19} /></span>
            <strong>Calibrate</strong>
            <span className="brand__version">Beta</span>
          </a>

          <nav>
            <a href="#features">Features</a>
            <a href="#workflow">Workflow</a>
            <a href="#privacy">Privacy</a>
          </nav>

          <div className="header-actions">
            <a className="button button-ghost" href="https://github.com/musabali314/CalibON" target="_blank" rel="noreferrer">
              <Code2 size={17} />
              GitHub
            </a>
            <button className="button button-primary" type="button" onClick={launchNewProject}>
              Launch studio
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </header>

      <Hero onLaunch={launchNewProject} onOpenDemo={openDemoProject} />
      <Features />
      <Workflow />

      <section className="section" id="privacy">
        <div className="content-container">
          <div className="privacy-panel glass-panel">
            <ShieldCheck size={34} />
            <div>
              <span className="section-eyebrow">Local by default</span>
              <h2>Your calibration images stay on your computer.</h2>
              <p>Designed for browser-side processing with WebAssembly. No account, cloud storage or remote upload is required.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="content-container">
          <span>Calibrate</span>
          <span>Browser-based camera calibration for robotics and computer vision.</span>
        </div>
      </footer>
    </div>
  );
}

function Features() {
  const items = [
    [Upload, "Upload or capture", "Use existing image sets or capture frames directly from a webcam."],
    [ScanLine, "Automatic detection", "Inspect every detected checkerboard corner before calibration."],
    [Grid3X3, "Dataset guidance", "See sharpness, coverage and pose diversity before solving."],
    [Aperture, "Camera parameters", "Estimate focal lengths, principal point and distortion."],
    [Sparkles, "Visual validation", "Review reprojection error and undistortion previews."],
    [ShieldCheck, "Private by design", "Your images remain on your device."],
  ] as const;

  return (
    <section className="section" id="features">
      <div className="content-container">
        <div className="section-header">
          <span className="section-eyebrow">Calibration without friction</span>
          <h2 className="section-title">Everything you need to trust your camera model.</h2>
        </div>

        <div className="feature-grid">
          {items.map(([Icon, title, text]) => (
            <article className="feature-card glass-panel" key={title}>
              <Icon size={23} />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Workflow() {
  return (
    <section className="section" id="workflow">
      <div className="content-container">
        <div className="section-header">
          <span className="section-eyebrow">One guided workflow</span>
          <h2 className="section-title">From raw images to usable intrinsics.</h2>
        </div>

        <div className="workflow-list">
          {["Configure", "Capture", "Review", "Calibrate", "Export"].map((item, index) => (
            <article key={item}>
              <span>0{index + 1}</span>
              <h3>{item}</h3>
              <p>{stages[index].description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

type WorkspaceProps = {
  project: CalibrationProject;
  stageIndex: number;
  setStage: (stage: CalibrationStage) => void;
  setProject: (project: CalibrationProject) => void;
  onBack: () => void;
};

function Workspace({
  project,
  stageIndex,
  setStage,
  setProject,
  onBack,
}: WorkspaceProps) {
  const current = stages[stageIndex];
  const setupValid = isSetupValid(project);
  const uploadValid = isUploadValid(project);
  const datasetReady = isDatasetReady(project);
  const isLastStage = stageIndex === stages.length - 1;
  const continueDisabled =
    isLastStage ||
    (project.stage === "setup" && !setupValid) ||
    (project.stage === "upload" && !uploadValid) ||
    (project.stage === "review" && !datasetReady) ||
    (project.stage === "calibrating" && !project.result);

  const continueTitle =
    project.stage === "setup" && !setupValid
      ? "Correct the highlighted setup fields first."
      : project.stage === "upload" && !uploadValid
        ? "Add enough images with the configured resolution first."
        : project.stage === "review" && !datasetReady
          ? "Analyze the dataset and accept enough frames first."
          : project.stage === "calibrating" && !project.result
            ? "Run calibration before opening Results."
            : undefined;

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <button className="brand brand-button" type="button" onClick={onBack}>
          <span className="brand__mark"><Aperture size={18} /></span>
          <strong>Calibrate</strong>
        </button>

        <div className="project-card">
          <span className="label">Current project</span>
          <strong>{project.name}</strong>
          <small>{project.settings.camera.model} · {project.settings.camera.imageSize.width}×{project.settings.camera.imageSize.height}</small>
        </div>

        <nav className="stage-nav" aria-label="Calibration workflow">
          {stages.map((stage, index) => {
            const locked =
              (index > 0 && !setupValid) ||
              (index > 1 && !uploadValid) ||
              (index > 2 && !datasetReady) ||
              (index > 3 && !project.result);

            return (
              <button
                key={stage.id}
                className={stage.id === project.stage ? "active" : ""}
                type="button"
                disabled={locked}
                title={locked ? "Complete the previous workflow stage first." : undefined}
                onClick={() => setStage(stage.id)}
              >
                <span>{index < stageIndex ? <Check size={14} /> : index + 1}</span>
                <div><strong>{stage.label}</strong><small>{stage.description}</small></div>
              </button>
            );
          })}
        </nav>

        <div className="local-note"><ShieldCheck size={15} />Local processing</div>
      </aside>

      <main className="workspace-main">
        <div className="workspace-panel glass-panel">
          <div className="workspace-toolbar">
            <div>
              <span className="label">Step {stageIndex + 1} of {stages.length}</span>
              <h1>{current.label}</h1>
              <p>{current.description}</p>
            </div>

            <div>
              <button className="button button-secondary" type="button" disabled={stageIndex === 0} onClick={() => setStage(stages[stageIndex - 1].id)}>
                <ArrowLeft size={16} />Back
              </button>
              <button className="button button-primary" type="button" disabled={continueDisabled} title={continueTitle} onClick={() => setStage(stages[stageIndex + 1].id)}>
                Continue<ArrowRight size={16} />
              </button>
            </div>
          </div>

          {project.stage === "setup" && <SetupPanel project={project} onChange={setProject} />}
          {project.stage === "upload" && <UploadPanel project={project} onChange={setProject} />}
          {project.stage === "review" && <DatasetPanel project={project} onChange={setProject} />}
          {project.stage === "calibrating" && <CalibrationPanel project={project} onChange={setProject} />}
          {project.stage === "results" && <ResultsPanel project={project} />}
        </div>
      </main>
    </div>
  );
}

export default App;
