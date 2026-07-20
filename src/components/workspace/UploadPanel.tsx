import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
} from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  FileImage,
  FolderOpen,
  HardDrive,
  ImagePlus,
  Loader2,
  Monitor,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";

import type {
  CalibrationFrame,
  CalibrationProject,
  ImageDimensions,
} from "../../types/calibration";
import "../../styles/upload.css";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const SUPPORTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

type UploadPanelProps = {
  project: CalibrationProject;
  onChange: (project: CalibrationProject) => void;
};

type LocalCalibrationFrame = CalibrationFrame & {
  localFile?: File;
  uploadFingerprint?: string;
};

export type UploadValidation = {
  isValid: boolean;
  totalFrames: number;
  matchingFrames: number;
  mismatchedFrames: number;
  requiredFrames: number;
  missingFrames: number;
};

type UploadIssue = {
  id: string;
  message: string;
};

export function getUploadValidation(
  project: CalibrationProject,
): UploadValidation {
  const expected = project.settings.camera.imageSize;
  const matchingFrames = project.frames.filter((frame) =>
    dimensionsMatch(frame.dimensions, expected),
  ).length;
  const mismatchedFrames = project.frames.length - matchingFrames;
  const requiredFrames = project.settings.minimumAcceptedFrames;
  const missingFrames = Math.max(0, requiredFrames - matchingFrames);

  return {
    isValid: missingFrames === 0 && mismatchedFrames === 0,
    totalFrames: project.frames.length,
    matchingFrames,
    mismatchedFrames,
    requiredFrames,
    missingFrames,
  };
}

export function isUploadValid(project: CalibrationProject) {
  return getUploadValidation(project).isValid;
}

function UploadPanel({ project, onChange }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [invalidCount, setInvalidCount] = useState(0);
  const [issues, setIssues] = useState<UploadIssue[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const expectedResolution = project.settings.camera.imageSize;
  const validation = useMemo(() => getUploadValidation(project), [project]);
  const totalSizeBytes = useMemo(
    () =>
      project.frames.reduce(
        (total, frame) => total + frame.fileSizeBytes,
        0,
      ),
    [project.frames],
  );

  const commitFrames = useCallback(
    (frames: CalibrationFrame[]) => {
      onChange({
        ...project,
        frames,
        datasetSummary: undefined,
        result: undefined,
        preview: undefined,
        progress: {
          status: "idle",
          stage: "idle",
          progressPercent: 0,
          message:
            frames.length > 0
              ? "Images ready for dataset analysis."
              : "Ready to begin.",
          processedFrames: 0,
          totalFrames: frames.length,
        },
        updatedAt: new Date().toISOString(),
      });
    },
    [onChange, project],
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || isProcessing) {
        return;
      }

      setIsProcessing(true);
      setNotice(null);

      const nextIssues: UploadIssue[] = [];
      let nextDuplicateCount = 0;
      let nextInvalidCount = 0;
      const existingFingerprints = new Set(
        project.frames.map(getFrameFingerprint),
      );
      const createdFrames: LocalCalibrationFrame[] = [];

      try {
        for (const file of files) {
          const fingerprint = createFileFingerprint(file);

          if (existingFingerprints.has(fingerprint)) {
            nextDuplicateCount += 1;
            nextIssues.push({
              id: createId("duplicate"),
              message: `${file.name} was skipped because it is already in the dataset.`,
            });
            continue;
          }

          if (!isSupportedImage(file)) {
            nextInvalidCount += 1;
            nextIssues.push({
              id: createId("format"),
              message: `${file.name} is not a supported JPG, PNG or WebP image.`,
            });
            continue;
          }

          if (file.size === 0) {
            nextInvalidCount += 1;
            nextIssues.push({
              id: createId("empty"),
              message: `${file.name} is empty and could not be imported.`,
            });
            continue;
          }

          if (file.size > MAX_FILE_SIZE_BYTES) {
            nextInvalidCount += 1;
            nextIssues.push({
              id: createId("size"),
              message: `${file.name} exceeds the 25 MB file-size limit.`,
            });
            continue;
          }

          const objectUrl = URL.createObjectURL(file);

          try {
            const dimensions = await readImageDimensions(objectUrl);

            createdFrames.push({
              id: createId("frame"),
              fileName: file.name,
              fileSizeBytes: file.size,
              mimeType: file.type || inferMimeType(file.name),
              sourceUrl: objectUrl,
              thumbnailUrl: objectUrl,
              dimensions,
              status: "pending",
              targetDetected: false,
              detectedPoints: [],
              metrics: {
                blurScore: 0,
                coverageScore: 0,
                poseDiversityScore: 0,
                detectionConfidence: 0,
              },
              rejectionReasons: [],
              manuallyIncluded: false,
              capturedAt: new Date(file.lastModified || Date.now()).toISOString(),
              localFile: file,
              uploadFingerprint: fingerprint,
            });

            existingFingerprints.add(fingerprint);
          } catch {
            URL.revokeObjectURL(objectUrl);
            nextInvalidCount += 1;
            nextIssues.push({
              id: createId("decode"),
              message: `${file.name} could not be decoded as an image.`,
            });
          }
        }

        if (createdFrames.length > 0) {
          commitFrames([...project.frames, ...createdFrames]);
          setNotice(
            `${createdFrames.length} image${
              createdFrames.length === 1 ? "" : "s"
            } added locally.`,
          );
        }

        setDuplicateCount((current) => current + nextDuplicateCount);
        setInvalidCount((current) => current + nextInvalidCount);
        setIssues(nextIssues.slice(0, 8));
      } finally {
        setIsProcessing(false);
      }
    },
    [commitFrames, isProcessing, project.frames],
  );

  const handleInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    await addFiles(files);
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (
      event.currentTarget.contains(event.relatedTarget as Node | null)
    ) {
      return;
    }

    setIsDragging(false);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    await addFiles(Array.from(event.dataTransfer.files));
  };

  const handleDropzoneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  const removeFrame = (frameId: string) => {
    const frame = project.frames.find((item) => item.id === frameId);

    if (frame) {
      releaseFrameUrls(frame);
    }

    commitFrames(project.frames.filter((item) => item.id !== frameId));
    setNotice("Image removed.");
  };

  const clearAllFrames = () => {
    project.frames.forEach(releaseFrameUrls);
    commitFrames([]);
    setDuplicateCount(0);
    setInvalidCount(0);
    setIssues([]);
    setNotice("All images were removed.");
  };

  const openFilePicker = () => {
    inputRef.current?.click();
  };

  const showWebcamNotice = () => {
    setNotice(
      "Webcam capture will be connected after the upload and dataset workflow is complete.",
    );
  };

  return (
    <div className="upload-panel">
      <div className="upload-panel__main">
        <section className="upload-source-section">
          <div className="upload-section-heading">
            <div className="upload-section-heading__icon">
              <ImagePlus size={20} />
            </div>

            <div>
              <span className="label">Image source</span>
              <h2>Add calibration frames</h2>
              <p>
                Use images showing the full checkerboard from different
                positions, distances and angles.
              </p>
            </div>
          </div>

          <div className="upload-source-options">
            <button
              className="upload-source-card upload-source-card--active"
              type="button"
              onClick={openFilePicker}
            >
              <span className="upload-source-card__icon">
                <FolderOpen size={21} />
              </span>
              <span>
                <strong>Upload images</strong>
                <small>JPG, PNG or WebP</small>
              </span>
              <CheckCircle2
                className="upload-source-card__check"
                size={18}
              />
            </button>

            <button
              className="upload-source-card"
              type="button"
              onClick={showWebcamNotice}
            >
              <span className="upload-source-card__icon">
                <Video size={21} />
              </span>
              <span>
                <strong>Use webcam</strong>
                <small>Capture live frames</small>
              </span>
              <span className="upload-source-card__soon">Soon</span>
            </button>
          </div>

          <input
            ref={inputRef}
            className="upload-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            multiple
            onChange={handleInputChange}
          />

          <div
            className={[
              "upload-dropzone",
              isDragging ? "upload-dropzone--dragging" : "",
              isProcessing ? "upload-dropzone--processing" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="button"
            tabIndex={0}
            aria-label="Upload calibration images"
            onClick={openFilePicker}
            onKeyDown={handleDropzoneKeyDown}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="upload-dropzone__visual">
              {isProcessing ? (
                <Loader2 className="upload-spinner" size={31} />
              ) : (
                <Upload size={31} />
              )}
            </div>

            <div className="upload-dropzone__content">
              <strong>
                {isProcessing
                  ? "Reading images..."
                  : isDragging
                    ? "Drop the images here"
                    : "Drag calibration images here"}
              </strong>
              <p>or click to browse your computer</p>
            </div>

            <div className="upload-dropzone__limits">
              <span>
                <FileImage size={14} />
                JPG, PNG, WebP
              </span>
              <span>
                <HardDrive size={14} />
                Maximum 25 MB each
              </span>
              <span>
                <Monitor size={14} />
                Expected {expectedResolution.width}×{expectedResolution.height}
              </span>
            </div>
          </div>
        </section>

        {(notice || issues.length > 0) && (
          <div className="upload-message-stack">
            {notice && (
              <div className="upload-notice">
                <CheckCircle2 size={17} />
                <span>{notice}</span>
                <button
                  type="button"
                  aria-label="Dismiss message"
                  onClick={() => setNotice(null)}
                >
                  <X size={15} />
                </button>
              </div>
            )}

            {issues.length > 0 && (
              <div className="upload-issues">
                <div className="upload-issues__header">
                  <AlertCircle size={18} />
                  <div>
                    <strong>Some files were skipped</strong>
                    <span>Review the import details below.</span>
                  </div>
                  <button
                    type="button"
                    aria-label="Dismiss issues"
                    onClick={() => setIssues([])}
                  >
                    <X size={15} />
                  </button>
                </div>

                <ul>
                  {issues.map((issue) => (
                    <li key={issue.id}>{issue.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <section className="upload-dataset-section">
          <div className="upload-dataset-header">
            <div>
              <span className="label">Uploaded dataset</span>
              <h2>
                {project.frames.length} image
                {project.frames.length === 1 ? "" : "s"}
              </h2>
              <p>Images remain local and are not uploaded to a server.</p>
            </div>

            <div className="upload-dataset-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={openFilePicker}
              >
                <ImagePlus size={16} />
                Add more
              </button>

              <button
                className="button button-ghost upload-clear-button"
                type="button"
                disabled={project.frames.length === 0}
                onClick={clearAllFrames}
              >
                <Trash2 size={16} />
                Clear all
              </button>
            </div>
          </div>

          {project.frames.length === 0 ? (
            <div className="upload-empty-state">
              <div>
                <Camera size={30} />
              </div>
              <h3>No calibration images yet</h3>
              <p>
                For reliable calibration, capture the board throughout the
                image and vary its tilt, scale and position.
              </p>
              <button
                className="button button-secondary"
                type="button"
                onClick={openFilePicker}
              >
                <FolderOpen size={16} />
                Select images
              </button>
            </div>
          ) : (
            <div className="upload-frame-grid">
              {project.frames.map((frame, index) => (
                <UploadFrameCard
                  key={frame.id}
                  frame={frame}
                  index={index}
                  expectedResolution={expectedResolution}
                  onRemove={() => removeFrame(frame.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="upload-panel__sidebar">
        <div className="upload-summary-card">
          <div className="upload-summary-card__header">
            <span className="label">Dataset readiness</span>
            <span
              className={
                validation.isValid
                  ? "upload-readiness upload-readiness--ready"
                  : "upload-readiness"
              }
            >
              {validation.isValid ? "Ready" : "Incomplete"}
            </span>
          </div>

          <div className="upload-count">
            <strong>{validation.matchingFrames}</strong>
            <span>/ {validation.requiredFrames} required images</span>
          </div>

          <div className="upload-progress-track">
            <span
              style={{
                width: `${Math.min(
                  100,
                  validation.requiredFrames > 0
                    ? (validation.matchingFrames /
                        validation.requiredFrames) *
                        100
                    : 0,
                )}%`,
              }}
            />
          </div>

          {validation.isValid ? (
            <div className="upload-validation-message upload-validation-message--success">
              <CheckCircle2 size={17} />
              <span>The dataset can proceed to quality analysis.</span>
            </div>
          ) : (
            <div className="upload-validation-message">
              <AlertCircle size={17} />
              <span>
                {validation.missingFrames > 0
                  ? `Add at least ${validation.missingFrames} more matching image${
                      validation.missingFrames === 1 ? "" : "s"
                    }.`
                  : "Remove images with mismatched resolutions."}
              </span>
            </div>
          )}
        </div>

        <div className="upload-stat-list">
          <UploadStat label="Total images" value={String(validation.totalFrames)} />
          <UploadStat
            label="Correct resolution"
            value={String(validation.matchingFrames)}
            positive={validation.matchingFrames > 0}
          />
          <UploadStat
            label="Resolution mismatch"
            value={String(validation.mismatchedFrames)}
            warning={validation.mismatchedFrames > 0}
          />
          <UploadStat
            label="Duplicate files skipped"
            value={String(duplicateCount)}
          />
          <UploadStat
            label="Invalid files skipped"
            value={String(invalidCount)}
            warning={invalidCount > 0}
          />
          <UploadStat label="Dataset size" value={formatBytes(totalSizeBytes)} />
        </div>

        <div className="upload-guidance-card">
          <span className="label">Capture guidance</span>
          <h3>Build a varied dataset</h3>
          <ul>
            <li>Keep the entire board visible.</li>
            <li>Move it toward image corners.</li>
            <li>Include several tilted views.</li>
            <li>Use both near and far images.</li>
            <li>Avoid motion blur and glare.</li>
          </ul>
        </div>

        <div className="upload-resolution-card">
          <Monitor size={18} />
          <div>
            <span className="label">Required resolution</span>
            <strong>
              {expectedResolution.width}×{expectedResolution.height}
            </strong>
            <small>All calibration images must use the same resolution.</small>
          </div>
        </div>
      </aside>
    </div>
  );
}

type UploadFrameCardProps = {
  frame: CalibrationFrame;
  index: number;
  expectedResolution: ImageDimensions;
  onRemove: () => void;
};

function UploadFrameCard({
  frame,
  index,
  expectedResolution,
  onRemove,
}: UploadFrameCardProps) {
  const matchesResolution = dimensionsMatch(
    frame.dimensions,
    expectedResolution,
  );

  return (
    <article
      className={[
        "upload-frame-card",
        !matchesResolution ? "upload-frame-card--warning" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="upload-frame-card__preview">
        <img
          src={frame.thumbnailUrl || frame.sourceUrl}
          alt={`Calibration frame ${index + 1}`}
        />
        <span className="upload-frame-card__number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span
          className={[
            "upload-frame-card__status",
            matchesResolution
              ? "upload-frame-card__status--ready"
              : "upload-frame-card__status--warning",
          ].join(" ")}
        >
          {matchesResolution ? (
            <CheckCircle2 size={13} />
          ) : (
            <AlertCircle size={13} />
          )}
          {matchesResolution ? "Ready" : "Mismatch"}
        </span>
        <button
          className="upload-frame-card__remove"
          type="button"
          aria-label={`Remove ${frame.fileName}`}
          onClick={onRemove}
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="upload-frame-card__details">
        <strong title={frame.fileName}>{frame.fileName}</strong>
        <div>
          <span>
            {frame.dimensions.width}×{frame.dimensions.height}
          </span>
          <span>{formatBytes(frame.fileSizeBytes)}</span>
        </div>
      </div>
    </article>
  );
}

type UploadStatProps = {
  label: string;
  value: string;
  positive?: boolean;
  warning?: boolean;
};

function UploadStat({
  label,
  value,
  positive = false,
  warning = false,
}: UploadStatProps) {
  return (
    <div className="upload-stat">
      <span>{label}</span>
      <strong
        className={
          warning
            ? "upload-stat__warning"
            : positive
              ? "upload-stat__positive"
              : undefined
        }
      >
        {value}
      </strong>
    </div>
  );
}

function dimensionsMatch(first: ImageDimensions, second: ImageDimensions) {
  return first.width === second.width && first.height === second.height;
}

function isSupportedImage(file: File) {
  const lowerName = file.name.toLowerCase();
  const supportedExtension = SUPPORTED_EXTENSIONS.some((extension) =>
    lowerName.endsWith(extension),
  );
  const supportedMimeType =
    !file.type || SUPPORTED_MIME_TYPES.includes(file.type);

  return supportedExtension && supportedMimeType;
}

function createFileFingerprint(file: File) {
  return [
    file.name.toLowerCase(),
    file.size,
    file.type || inferMimeType(file.name),
  ].join("::");
}

function getFrameFingerprint(frame: CalibrationFrame) {
  const localFrame = frame as LocalCalibrationFrame;

  return (
    localFrame.uploadFingerprint ??
    [frame.fileName.toLowerCase(), frame.fileSizeBytes, frame.mimeType].join(
      "::",
    )
  );
}

function readImageDimensions(sourceUrl: string): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.decoding = "async";

    image.onload = () => {
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        reject(new Error("Invalid image dimensions."));
        return;
      }

      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };

    image.onerror = () => {
      reject(new Error("The image could not be decoded."));
    };

    image.src = sourceUrl;
  });
}

function inferMimeType(fileName: string) {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lowerName.endsWith(".png")) {
    return "image/png";
  }

  if (lowerName.endsWith(".webp")) {
    return "image/webp";
  }

  return "application/octet-stream";
}

function releaseFrameUrls(frame: CalibrationFrame) {
  const urls = new Set([frame.sourceUrl, frame.thumbnailUrl]);

  urls.forEach((url) => {
    if (url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  });
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatBytes(bytes: number) {
  if (bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** unitIndex;

  return `${value.toFixed(
    unitIndex === 0 ? 0 : value >= 10 ? 1 : 2,
  )} ${units[unitIndex]}`;
}

export default UploadPanel;
