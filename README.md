# CalibON

<p align="center">
  <a href="https://calibon.vercel.app">
    <img src="demo.gif" alt="CalibON demo" width="100%">
  </a>
</p>

<p align="center">
  <strong>Browser-based camera calibration for robotics and computer vision.</strong>
</p>

<p align="center">
  <a href="https://calibon.vercel.app"><strong>Launch CalibON</strong></a>
  ·
  <a href="#features">Features</a>
  ·
  <a href="#local-development">Local development</a>
  ·
  <a href="#exports">Exports</a>
</p>

---

## Overview

CalibON is a guided camera-calibration studio built for robotics and computer-vision workflows. It helps users configure a checkerboard target, upload calibration images, inspect detected corners, review dataset quality, run intrinsic calibration, evaluate reprojection error, preview undistortion, and export the resulting camera model.

The application consists of:

- a React, TypeScript, and Vite frontend;
- a FastAPI backend;
- native OpenCV-based checkerboard detection and calibration;
- interactive Three.js visuals on the landing page.

### Live website

**[Open CalibON in your browser](https://calibon.vercel.app)**

> The hosted version sends selected images to the calibration backend for temporary processing. Images are not intentionally retained by the application.

## Features

- Guided five-step calibration workflow
- Pinhole camera model
- Configurable checkerboard inner-corner dimensions
- Multiple-image drag-and-drop upload
- Resolution and dataset validation
- Native OpenCV checkerboard detection
- Subpixel corner refinement
- Per-frame sharpness, coverage, and pose metrics
- Accepted and rejected frame review
- Dataset coverage visualization
- Camera intrinsic calibration
- Reprojection-error diagnostics
- Automatic calibration outlier handling
- Undistortion preview
- OpenCV, ROS `camera_info`, Kalibr, and JSON exports
- Local development mode with a Python backend
- Responsive dark interface

## Calibration workflow

1. **Setup**  
   Configure the project name, image resolution, camera model, checkerboard dimensions, square size, and solver options.

2. **Images**  
   Upload a set of calibration images captured at different positions, distances, and angles.

3. **Dataset**  
   Detect and refine checkerboard corners, inspect quality metrics, and include or exclude individual frames.

4. **Calibration**  
   Estimate the camera matrix and distortion coefficients using the accepted images.

5. **Results**  
   Review intrinsics, distortion values, reprojection error, per-frame diagnostics, undistortion output, and downloadable exports.

## Checkerboard configuration

CalibON expects checkerboard dimensions to be entered as **inner corners**, not printed squares.

| Printed checkerboard | CalibON configuration | Detected points |
|---|---:|---:|
| 9 × 6 squares | 8 × 5 inner corners | 40 |
| 10 × 7 squares | 9 × 6 inner corners | 54 |

For best results:

- keep the entire board visible;
- capture it near the center, edges, and corners of the image;
- include near, medium, and far views;
- include several tilted views;
- avoid glare, blur, and repeated near-identical poses;
- use the same image resolution throughout the dataset.

## Tech stack

### Frontend

- React
- TypeScript
- Vite
- Three.js
- React Three Fiber
- Lucide React

### Backend

- FastAPI
- OpenCV
- NumPy
- Python Multipart

### Deployment

- Vercel frontend
- Vercel Python/FastAPI backend

## Project structure

```text
CalibON/
├── backend/
│   ├── index.py
│   ├── server.py
│   ├── requirements.txt
│   └── vercel.json
├── public/
├── src/
│   ├── components/
│   │   ├── landing/
│   │   ├── three/
│   │   └── workspace/
│   ├── data/
│   ├── lib/
│   ├── styles/
│   └── types/
├── index.html
├── package.json
├── package-lock.json
├── start-calibon.ps1
├── vite.config.ts
└── README.md
```

## Local development

### Prerequisites

- Node.js 18 or newer
- npm
- Python 3.11 or newer
- PowerShell on Windows

### 1. Clone the repository

```bash
git clone https://github.com/musabali314/CalibON.git
cd CalibON
```

### 2. Install frontend dependencies

```powershell
npm install
```

### 3. Create the Python environment

```powershell
py -3.11 -m venv .venv-calibon
.\.venv-calibon\Scripts\python.exe -m pip install --upgrade pip
.\.venv-calibon\Scripts\python.exe -m pip install -r .\backend\requirements.txt
```

### 4. Configure the local frontend API URL

Create `.env.local` in the repository root:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

### 5. Start CalibON

```powershell
powershell -ExecutionPolicy Bypass -File ".\start-calibon.ps1"
```

The application should be available at:

```text
Frontend: http://localhost:5173
Backend:  http://127.0.0.1:8000
```

Test the backend health endpoint at:

```text
http://127.0.0.1:8000/api/health
```

## Manual development commands

Start the backend:

```powershell
.\.venv-calibon\Scripts\python.exe -m uvicorn backend.server:app --host 127.0.0.1 --port 8000
```

Start the frontend in a second terminal:

```powershell
npm run dev
```

Build the frontend:

```powershell
npm run build
```

## Environment variables

### Frontend

| Variable | Description | Example |
|---|---|---|
| `VITE_API_BASE_URL` | Base URL of the FastAPI backend | `https://calibon-api.vercel.app` |

### Backend

| Variable | Description | Example |
|---|---|---|
| `FRONTEND_ORIGINS` | Comma-separated allowed frontend origins | `http://localhost:5173,https://calibon.vercel.app` |

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Backend health check |
| `POST` | `/api/analyze` | Detect and analyze checkerboard frames |
| `POST` | `/api/calibrate` | Run camera calibration and return results |

## Exports

CalibON can export calibration results in these formats:

### OpenCV JSON

Includes image dimensions, camera matrix, distortion coefficients, reprojection statistics, and accepted-frame metadata.

### ROS `camera_info` YAML

Suitable for ROS camera workflows and `sensor_msgs/CameraInfo`.

### Kalibr YAML

Provides camera intrinsics and distortion data in a Kalibr-compatible structure.

### Full JSON report

Contains the complete project, dataset, calibration, and diagnostics information.

## Interpreting reprojection error

Reprojection error measures the distance between detected image corners and the locations predicted by the calibrated camera model.

Lower is generally better, but the acceptable value depends on image resolution, target quality, lens characteristics, and the intended application. Always inspect:

- overall RMS error;
- per-frame errors;
- corner placement;
- distortion plausibility;
- undistorted output;
- whether the dataset covers the whole image.

A low numeric error alone does not guarantee a good calibration if the dataset lacks pose or image coverage.

## Privacy

### Hosted version

Uploaded images are transmitted to the deployed calibration backend for processing. The application is designed to process them temporarily and does not intentionally retain them.

### Local version

When CalibON is run locally, the frontend and backend remain on the user's own computer.

## Current limitations

- Checkerboard calibration only
- Pinhole model is the primary supported model
- ChArUco, AprilGrid, and fisheye workflows are planned
- Hosted calibration performance depends on serverless runtime limits
- Browser refresh currently resets the active project
- Webcam capture is not yet fully implemented

## Roadmap

- ChArUco support
- AprilGrid support
- Fisheye calibration
- Webcam capture
- Project persistence
- Dataset import and export
- Stereo calibration
- Calibration comparison
- Better automatic pose-diversity guidance
- Desktop packaging

## Contributing

Issues, feature requests, and pull requests are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make and test your changes.
4. Submit a pull request with a clear description.

## License

Add a `LICENSE` file before wider distribution. The MIT License is a common choice for open-source developer tools, but choose the license that matches how you want others to use the project.

## Author

Built by [Musab Ali](https://github.com/musabali314).

---

<p align="center">
  <a href="https://calibon.vercel.app"><strong>Launch CalibON →</strong></a>
</p>
