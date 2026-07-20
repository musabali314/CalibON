import { useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AlertCircle,
  Camera,
  Check,
  Grid3X3,
  Info,
  Monitor,
  Ruler,
  Settings2,
} from "lucide-react";

import type {
  CalibrationProject,
  CalibrationSettings,
  CalibrationTargetConfig,
  CameraConfig,
  CameraModel,
  ImageDimensions,
} from "../../types/calibration";

import "../../styles/setup.css";

type SetupPanelProps = {
  project: CalibrationProject;
  onChange: (project: CalibrationProject) => void;
};

type SetupErrorKey =
  | "projectName"
  | "cameraName"
  | "frameId"
  | "imageWidth"
  | "imageHeight"
  | "columns"
  | "rows"
  | "squareSizeMm"
  | "minimumAcceptedFrames";

export type SetupValidationErrors = Partial<Record<SetupErrorKey, string>>;

const resolutionPresets = [
  { label: "720p", width: 1280, height: 720 },
  { label: "1080p", width: 1920, height: 1080 },
  { label: "1440p", width: 2560, height: 1440 },
  { label: "4K", width: 3840, height: 2160 },
] as const;

const numberFromInput = (value: string) => {
  if (value.trim() === "") {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function getSetupValidationErrors(
  project: CalibrationProject,
): SetupValidationErrors {
  const errors: SetupValidationErrors = {};
  const { camera, target, minimumAcceptedFrames } = project.settings;

  if (!project.name.trim()) {
    errors.projectName = "Give this calibration project a name.";
  }

  if (!camera.cameraName.trim()) {
    errors.cameraName = "Camera name is required.";
  }

  if (!camera.frameId.trim()) {
    errors.frameId = "Frame ID is required for ROS-compatible exports.";
  }

  if (camera.imageSize.width < 64 || camera.imageSize.width > 16384) {
    errors.imageWidth = "Width must be between 64 and 16,384 pixels.";
  }

  if (camera.imageSize.height < 64 || camera.imageSize.height > 16384) {
    errors.imageHeight = "Height must be between 64 and 16,384 pixels.";
  }

  if (!Number.isInteger(target.columns) || target.columns < 3 || target.columns > 30) {
    errors.columns = "Use between 3 and 30 inner-corner columns.";
  }

  if (!Number.isInteger(target.rows) || target.rows < 3 || target.rows > 30) {
    errors.rows = "Use between 3 and 30 inner-corner rows.";
  }

  if (target.squareSizeMm <= 0 || target.squareSizeMm > 1000) {
    errors.squareSizeMm = "Square size must be greater than 0 and at most 1,000 mm.";
  }

  if (
    !Number.isInteger(minimumAcceptedFrames) ||
    minimumAcceptedFrames < 3 ||
    minimumAcceptedFrames > 200
  ) {
    errors.minimumAcceptedFrames = "Choose between 3 and 200 accepted frames.";
  }

  return errors;
}

export function isSetupValid(project: CalibrationProject) {
  return Object.keys(getSetupValidationErrors(project)).length === 0;
}

function SetupPanel({ project, onChange }: SetupPanelProps) {
  const errors = useMemo(() => getSetupValidationErrors(project), [project]);
  const errorCount = Object.keys(errors).length;
  const { camera, target } = project.settings;

  const boardSquareColumns = target.columns + 1;
  const boardSquareRows = target.rows + 1;
  const boardWidthMm = boardSquareColumns * target.squareSizeMm;
  const boardHeightMm = boardSquareRows * target.squareSizeMm;

  const boardStyle: CSSProperties = {
    aspectRatio: `${boardSquareColumns} / ${boardSquareRows}`,
    backgroundSize: `${200 / boardSquareColumns}% ${200 / boardSquareRows}%`,
  };

  const commit = (nextProject: CalibrationProject) => {
    onChange({
      ...nextProject,
      updatedAt: new Date().toISOString(),
    });
  };

  const updateCamera = (patch: Partial<CameraConfig>) => {
    commit({
      ...project,
      settings: {
        ...project.settings,
        camera: {
          ...project.settings.camera,
          ...patch,
        },
      },
    });
  };

  const updateImageSize = (patch: Partial<ImageDimensions>) => {
    updateCamera({
      imageSize: {
        ...project.settings.camera.imageSize,
        ...patch,
      },
    });
  };

  const updateTarget = (patch: Partial<CalibrationTargetConfig>) => {
    commit({
      ...project,
      settings: {
        ...project.settings,
        target: {
          ...project.settings.target,
          ...patch,
        },
      },
    });
  };

  const updateSettings = (patch: Partial<CalibrationSettings>) => {
    commit({
      ...project,
      settings: {
        ...project.settings,
        ...patch,
      },
    });
  };

  const selectCameraModel = (model: CameraModel) => {
    commit({
      ...project,
      settings: {
        ...project.settings,
        camera: {
          ...project.settings.camera,
          model,
        },
        enableTangentialDistortion:
          model === "fisheye"
            ? false
            : project.settings.enableTangentialDistortion,
      },
    });
  };

  return (
    <div className="setup-panel">
      <div className="setup-panel__form">
        <SetupSection
          icon={<Settings2 size={19} />}
          eyebrow="Project"
          title="Project details"
          description="Name this calibration and define the identifiers used in exported files."
        >
          <div className="setup-input-grid setup-input-grid--three">
            <Field
              htmlFor="project-name"
              label="Project name"
              hint="Only used inside this browser session."
              error={errors.projectName}
              className="setup-field--wide"
            >
              <input
                id="project-name"
                className="setup-input"
                type="text"
                value={project.name}
                autoComplete="off"
                onChange={(event) =>
                  commit({
                    ...project,
                    name: event.target.value,
                  })
                }
              />
            </Field>

            <Field
              htmlFor="camera-name"
              label="Camera name"
              hint="Example: front_camera"
              error={errors.cameraName}
            >
              <input
                id="camera-name"
                className="setup-input setup-input--mono"
                type="text"
                value={camera.cameraName}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) =>
                  updateCamera({ cameraName: event.target.value })
                }
              />
            </Field>

            <Field
              htmlFor="frame-id"
              label="Frame ID"
              hint="Used in ROS camera_info exports."
              error={errors.frameId}
            >
              <input
                id="frame-id"
                className="setup-input setup-input--mono"
                type="text"
                value={camera.frameId}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) =>
                  updateCamera({ frameId: event.target.value })
                }
              />
            </Field>
          </div>
        </SetupSection>

        <SetupSection
          icon={<Camera size={19} />}
          eyebrow="Camera"
          title="Camera model"
          description="Choose the projection model that best matches the physical lens."
        >
          <div className="setup-choice-grid setup-choice-grid--two">
            <ChoiceCard
              active={camera.model === "pinhole"}
              title="Pinhole"
              badge="Recommended"
              description="Standard perspective cameras with moderate radial and tangential distortion."
              onClick={() => selectCameraModel("pinhole")}
            />

            <ChoiceCard
              active={camera.model === "fisheye"}
              title="Fisheye"
              badge="WASM build pending"
              description="Wide-angle calibration requires a dedicated fisheye-enabled OpenCV WebAssembly build."
              disabled
              onClick={() => undefined}
            />
          </div>

          <div className="setup-subsection">
            <div className="setup-subsection__heading">
              <div>
                <span className="label">Expected image size</span>
                <p>Use the resolution produced by the camera during calibration.</p>
              </div>

              <Monitor size={18} />
            </div>

            <div className="setup-resolution-presets">
              {resolutionPresets.map((preset) => {
                const active =
                  camera.imageSize.width === preset.width &&
                  camera.imageSize.height === preset.height;

                return (
                  <button
                    key={preset.label}
                    className={`setup-preset ${active ? "active" : ""}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      updateImageSize({
                        width: preset.width,
                        height: preset.height,
                      })
                    }
                  >
                    <strong>{preset.label}</strong>
                    <span>
                      {preset.width} × {preset.height}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="setup-input-grid setup-input-grid--two">
              <Field
                htmlFor="image-width"
                label="Image width"
                suffix="px"
                error={errors.imageWidth}
              >
                <input
                  id="image-width"
                  className="setup-input setup-input--number"
                  type="number"
                  min={64}
                  max={16384}
                  step={1}
                  value={camera.imageSize.width}
                  onChange={(event) =>
                    updateImageSize({
                      width: numberFromInput(event.target.value),
                    })
                  }
                />
              </Field>

              <Field
                htmlFor="image-height"
                label="Image height"
                suffix="px"
                error={errors.imageHeight}
              >
                <input
                  id="image-height"
                  className="setup-input setup-input--number"
                  type="number"
                  min={64}
                  max={16384}
                  step={1}
                  value={camera.imageSize.height}
                  onChange={(event) =>
                    updateImageSize({
                      height: numberFromInput(event.target.value),
                    })
                  }
                />
              </Field>
            </div>
          </div>
        </SetupSection>

        <SetupSection
          icon={<Grid3X3 size={19} />}
          eyebrow="Target"
          title="Calibration target"
          description="The values below must match the target used in every uploaded image."
        >
          <div className="setup-choice-grid setup-choice-grid--three">
            <ChoiceCard
              active={target.type === "checkerboard"}
              title="Checkerboard"
              badge="Available"
              description="Classic black-and-white grid using inner-corner detection."
              onClick={() => updateTarget({ type: "checkerboard" })}
            />

            <ChoiceCard
              active={target.type === "charuco"}
              title="ChArUco"
              badge="Coming soon"
              description="ArUco markers combined with checkerboard corner refinement."
              disabled
              onClick={() => undefined}
            />

            <ChoiceCard
              active={target.type === "aprilgrid"}
              title="AprilGrid"
              badge="Coming soon"
              description="AprilTag grid commonly used by Kalibr workflows."
              disabled
              onClick={() => undefined}
            />
          </div>

          <div className="setup-target-layout">
            <div className="setup-input-grid setup-input-grid--three">
              <Field
                htmlFor="target-columns"
                label="Columns"
                hint="Inner corners, not printed squares."
                error={errors.columns}
              >
                <input
                  id="target-columns"
                  className="setup-input setup-input--number"
                  type="number"
                  min={3}
                  max={30}
                  step={1}
                  value={target.columns}
                  onChange={(event) =>
                    updateTarget({
                      columns: Math.trunc(numberFromInput(event.target.value)),
                    })
                  }
                />
              </Field>

              <Field
                htmlFor="target-rows"
                label="Rows"
                hint="Inner corners, not printed squares."
                error={errors.rows}
              >
                <input
                  id="target-rows"
                  className="setup-input setup-input--number"
                  type="number"
                  min={3}
                  max={30}
                  step={1}
                  value={target.rows}
                  onChange={(event) =>
                    updateTarget({
                      rows: Math.trunc(numberFromInput(event.target.value)),
                    })
                  }
                />
              </Field>

              <Field
                htmlFor="square-size"
                label="Square size"
                hint="Measure one printed square precisely."
                suffix="mm"
                error={errors.squareSizeMm}
              >
                <input
                  id="square-size"
                  className="setup-input setup-input--number"
                  type="number"
                  min={0.1}
                  max={1000}
                  step={0.1}
                  value={target.squareSizeMm}
                  onChange={(event) =>
                    updateTarget({
                      squareSizeMm: numberFromInput(event.target.value),
                    })
                  }
                />
              </Field>
            </div>

            <div className="setup-board-preview" aria-label="Checkerboard preview">
              <div className="setup-board-preview__frame">
                <div className="setup-board-preview__pattern" style={boardStyle} />
              </div>

              <div className="setup-board-preview__caption">
                <span>
                  {target.columns} × {target.rows} inner corners
                </span>
                <strong>
                  {boardWidthMm.toFixed(1)} × {boardHeightMm.toFixed(1)} mm
                </strong>
              </div>
            </div>
          </div>

          <div className="setup-info-note">
            <Info size={17} />
            <p>
              A 9 × 6 inner-corner target contains 10 × 7 printed squares. Enter the
              inner-corner count, which is the convention used by OpenCV calibration.
            </p>
          </div>
        </SetupSection>

        <SetupSection
          icon={<Ruler size={19} />}
          eyebrow="Solver"
          title="Calibration options"
          description="These flags will be passed to the browser-side OpenCV solver later."
        >
          <div className="setup-input-grid setup-input-grid--two setup-frame-count-row">
            <Field
              htmlFor="minimum-frames"
              label="Minimum accepted frames"
              hint="12–20 varied images is a practical starting point."
              error={errors.minimumAcceptedFrames}
            >
              <input
                id="minimum-frames"
                className="setup-input setup-input--number"
                type="number"
                min={3}
                max={200}
                step={1}
                value={project.settings.minimumAcceptedFrames}
                onChange={(event) =>
                  updateSettings({
                    minimumAcceptedFrames: Math.trunc(
                      numberFromInput(event.target.value),
                    ),
                  })
                }
              />
            </Field>
          </div>

          <div className="setup-toggle-list">
            <ToggleRow
              title="Tangential distortion"
              description={
                camera.model === "fisheye"
                  ? "The fisheye model does not use pinhole tangential coefficients."
                  : "Estimate p1 and p2 to account for lens and sensor misalignment."
              }
              checked={project.settings.enableTangentialDistortion}
              disabled={camera.model === "fisheye"}
              onChange={(checked) =>
                updateSettings({ enableTangentialDistortion: checked })
              }
            />

            <ToggleRow
              title="Fix principal point"
              description="Keep the optical center fixed at the image center during optimization."
              checked={project.settings.fixPrincipalPoint}
              onChange={(checked) =>
                updateSettings({ fixPrincipalPoint: checked })
              }
            />

            <ToggleRow
              title="Fix aspect ratio"
              description="Constrain fx and fy to preserve the initial focal-length ratio."
              checked={project.settings.fixAspectRatio}
              onChange={(checked) =>
                updateSettings({ fixAspectRatio: checked })
              }
            />

            <ToggleRow
              title="Use intrinsic guess"
              description="Initialize the solver from approximate camera intrinsics when available."
              checked={project.settings.useIntrinsicGuess}
              onChange={(checked) =>
                updateSettings({ useIntrinsicGuess: checked })
              }
            />
          </div>
        </SetupSection>
      </div>

      <aside className="setup-summary">
        <div className="setup-summary__card">
          <span className="label">Configuration summary</span>
          <h2>Ready for image collection</h2>

          <div className="setup-summary__board">
            <div className="setup-summary__board-pattern" style={boardStyle} />
          </div>

          <dl className="setup-summary__list">
            <SummaryRow label="Model" value={camera.model === "pinhole" ? "Pinhole" : "Fisheye"} />
            <SummaryRow
              label="Resolution"
              value={`${camera.imageSize.width} × ${camera.imageSize.height}`}
            />
            <SummaryRow
              label="Target"
              value={`${target.columns} × ${target.rows} checkerboard`}
            />
            <SummaryRow
              label="Detection points"
              value={String(target.columns * target.rows)}
            />
            <SummaryRow
              label="Printed area"
              value={`${boardWidthMm.toFixed(1)} × ${boardHeightMm.toFixed(1)} mm`}
            />
            <SummaryRow
              label="Frame target"
              value={`${project.settings.minimumAcceptedFrames} accepted`}
            />
          </dl>

          <div
            className={`setup-readiness ${errorCount === 0 ? "setup-readiness--ready" : ""}`}
          >
            {errorCount === 0 ? <Check size={18} /> : <AlertCircle size={18} />}

            <div>
              <strong>
                {errorCount === 0
                  ? "Configuration complete"
                  : `${errorCount} field${errorCount === 1 ? "" : "s"} need attention`}
              </strong>
              <span>
                {errorCount === 0
                  ? "Continue to add calibration images."
                  : "Correct the highlighted values before continuing."}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

type SetupSectionProps = {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

function SetupSection({
  icon,
  eyebrow,
  title,
  description,
  children,
}: SetupSectionProps) {
  return (
    <section className="setup-section">
      <header className="setup-section__header">
        <span className="setup-section__icon">{icon}</span>

        <div>
          <span className="label">{eyebrow}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>

      <div className="setup-section__body">{children}</div>
    </section>
  );
}

type FieldProps = {
  htmlFor: string;
  label: string;
  hint?: string;
  suffix?: string;
  error?: string;
  className?: string;
  children: ReactNode;
};

function Field({
  htmlFor,
  label,
  hint,
  suffix,
  error,
  className = "",
  children,
}: FieldProps) {
  return (
    <div className={`setup-field ${error ? "setup-field--error" : ""} ${className}`}>
      <div className="setup-field__label-row">
        <label htmlFor={htmlFor}>{label}</label>
        {suffix && <span>{suffix}</span>}
      </div>

      {children}

      {error ? (
        <span className="setup-field__error">
          <AlertCircle size={13} />
          {error}
        </span>
      ) : (
        hint && <span className="setup-field__hint">{hint}</span>
      )}
    </div>
  );
}

type ChoiceCardProps = {
  active: boolean;
  title: string;
  description: string;
  badge?: string;
  disabled?: boolean;
  onClick: () => void;
};

function ChoiceCard({
  active,
  title,
  description,
  badge,
  disabled = false,
  onClick,
}: ChoiceCardProps) {
  return (
    <button
      className={`setup-choice-card ${active ? "active" : ""}`}
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="setup-choice-card__topline">
        <strong>{title}</strong>
        {active ? <Check size={17} /> : badge && <small>{badge}</small>}
      </span>

      <span>{description}</span>
    </button>
  );
}

type ToggleRowProps = {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

function ToggleRow({
  title,
  description,
  checked,
  disabled = false,
  onChange,
}: ToggleRowProps) {
  return (
    <div className={`setup-toggle ${disabled ? "setup-toggle--disabled" : ""}`}>
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>

      <button
        className="setup-toggle__control"
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

type SummaryRowProps = {
  label: string;
  value: string;
};

function SummaryRow({ label, value }: SummaryRowProps) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default SetupPanel;
