import { useEffect, useState } from "react";
import UploadStep from "./components/UploadStep";
import LineCanvas from "./components/LineCanvas";
import RoiCanvas from "./components/RoiCanvas";
import ParamsPanel from "./components/ParamsPanel";
import AdjustPanel from "./components/AdjustPanel";
import RunStatus from "./components/RunStatus";
import ResultsView, { STATUS_LABEL } from "./components/ResultsView";
import { ADJUST_DEFAULTS, adjustFilter, vignetteStyle } from "./adjust";
import {
  createJob,
  getPreset,
  jobStreamUrl,
  listPresets,
  savePreset,
} from "./api";
import "./App.css";

const DEFAULT_CLASSES = ["car", "truck", "bus", "motorcycle"];
const PRESET_COLORS = ["#2ecc71", "#ff3b30", "#f1c40f", "#3498db", "#9b59b6"];
const SETTINGS_DEFAULTS = {
  lineColorA: "#2ecc71",
  lineColorB: "#ff3b30",
  lineThickness: 4,
  roiColor: "#2ecc71",
  roiThickness: 4,
};

// ponytail: localStorage only, no backend sync — fine for a single-user local tool.
function useStoredState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? initial : JSON.parse(saved);
    } catch {
      return initial;
    }
  });
  function set(next) {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // storage unavailable (private mode, quota) — in-memory value still works
    }
  }
  return [value, set];
}

function ColorSwatches({ value, onChange }) {
  return (
    <span className="color-swatches">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`color-swatch${value === c ? " active" : ""}`}
          style={{ background: c }}
          aria-label={c}
          onClick={() => onChange(c)}
        />
      ))}
    </span>
  );
}

export default function App() {
  const [step, setStep] = useState("setup"); // 'setup' | 'running' | 'results'
  const [videoData, setVideoData] = useState(null);
  const [params, setParams] = useState({
    model_id: "yolo11s",
    conf: 0.5,
    imgsz: 960,
    classes: DEFAULT_CLASSES,
    line_y: 0,
    line_y2: 0,
  });
  const [lineColorA, setLineColorA] = useStoredState(
    "lineColorA",
    SETTINGS_DEFAULTS.lineColorA,
  );
  const [lineColorB, setLineColorB] = useStoredState(
    "lineColorB",
    SETTINGS_DEFAULTS.lineColorB,
  );
  const [lineThickness, setLineThickness] = useStoredState(
    "lineThickness",
    SETTINGS_DEFAULTS.lineThickness,
  );
  const [roi, setRoi] = useState(null);
  const [roiColor, setRoiColor] = useStoredState(
    "roiColor",
    SETTINGS_DEFAULTS.roiColor,
  );
  const [roiThickness, setRoiThickness] = useStoredState(
    "roiThickness",
    SETTINGS_DEFAULTS.roiThickness,
  );
  const [adjust, setAdjust] = useStoredState("adjust", ADJUST_DEFAULTS);
  const previewFilter = adjustFilter(adjust);
  const vignette = vignetteStyle(adjust);
  // Single source of truth for which filter a run uses: lines OR ROI, never
  // both. null until a tool is picked, so the frame starts clean.
  const [drawMode, setDrawMode] = useState(null); // null | 'line' | 'roi'
  const [jobId, setJobId] = useState(null);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [starting, setStarting] = useState(false);
  const [presetNames, setPresetNames] = useState([]);
  const [presetName, setPresetName] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [streamLoaded, setStreamLoaded] = useState(false);

  function refreshPresetNames() {
    listPresets()
      .then((res) => setPresetNames(res.names))
      .catch(() => {});
  }

  useEffect(() => {
    refreshPresetNames();
  }, []);

  function resetLineRoiSettings() {
    setLineColorA(SETTINGS_DEFAULTS.lineColorA);
    setLineColorB(SETTINGS_DEFAULTS.lineColorB);
    setLineThickness(SETTINGS_DEFAULTS.lineThickness);
    setRoiColor(SETTINGS_DEFAULTS.roiColor);
    setRoiThickness(SETTINGS_DEFAULTS.roiThickness);
    setAdjust(ADJUST_DEFAULTS);
    setRoi(null);
    setDrawMode(null);
  }

  function handleUploaded(data) {
    setVideoData(data);
    resetLineRoiSettings();
    const mid = Math.round(data.height / 2);
    setParams((p) => ({
      ...p,
      line_y: Math.max(mid - 40, 0),
      line_y2: Math.min(mid + 40, data.height),
    }));
  }

  async function handleRun() {
    setStarting(true);
    setErrorMessage(null);
    try {
      const job = await createJob({
        video_id: videoData.video_id,
        ...params,
        line_y: drawMode === "line" ? params.line_y : null,
        line_y2: drawMode === "line" ? params.line_y2 : null,
        roi: drawMode === "roi" ? roi : null,
        line_color_a: lineColorA,
        line_color_b: lineColorB,
        roi_color: roiColor,
        line_thickness: lineThickness,
        adjust,
      });
      setJobId(job.job_id);
      setStreamLoaded(false);
      setResult(null);
      setStep("running");
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setStarting(false);
    }
  }

  function handleProgress(res) {
    setResult(res);
  }

  function handleDone(res) {
    setResult(res);
    setStep("results");
  }

  function handleError(message) {
    setErrorMessage(message);
    setResult(null);
    setStep("setup");
  }

  function handleReset() {
    setStep("setup");
    setResult(null);
    setJobId(null);
  }

  async function handleSavePreset() {
    if (!presetName.trim()) return;
    try {
      await savePreset(presetName.trim(), {
        line_y: params.line_y,
        line_y2: params.line_y2,
        lineColorA,
        lineColorB,
        lineThickness,
        roi,
        roiColor,
        roiThickness,
        adjust,
      });
      setPresetName("");
      refreshPresetNames();
    } catch (err) {
      setErrorMessage(err.message);
    }
  }

  async function handleLoadPreset(name) {
    if (!name) return;
    try {
      const cfg = await getPreset(name);
      setParams((p) => ({ ...p, line_y: cfg.line_y, line_y2: cfg.line_y2 }));
      setLineColorA(cfg.lineColorA);
      setLineColorB(cfg.lineColorB);
      setLineThickness(cfg.lineThickness);
      setRoi(cfg.roi);
      // A preset carries one filter too — follow whichever it saved.
      setDrawMode(cfg.roi ? "roi" : "line");
      setRoiColor(cfg.roiColor);
      setRoiThickness(cfg.roiThickness);
      // Presets saved before the adjust panel have no `adjust` key.
      setAdjust(cfg.adjust ?? ADJUST_DEFAULTS);
    } catch (err) {
      setErrorMessage(err.message);
    }
  }

  function handleChangeVideo() {
    setVideoData(null);
    setRoi(null);
    setDrawMode(null);
    setResult(null);
    setJobId(null);
    setErrorMessage(null);
    setStep("setup");
  }

  const running = step === "running";
  const filterReady = drawMode === "line" || (drawMode === "roi" && Boolean(roi));
  const canRun =
    Boolean(videoData) &&
    params.classes.length > 0 &&
    filterReady &&
    !starting &&
    !running;

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-header__logo">
          <span className="app-header__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="17" height="17">
              <path
                d="M4 8.5V5.5A1.5 1.5 0 0 1 5.5 4h3M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3M8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="12" cy="12" r="2.4" fill="currentColor" />
            </svg>
          </span>
          Object Tracker
        </span>
        <nav className="app-header__menu">
          <a href="#" aria-label="Docs" title="Docs">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path
                d="M6 3.5h9l3 3V20a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M9 12h6M9 15.5h6M9 8.5h3"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </a>
          <a href="#" aria-label="Settings" title="Settings">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"
              />
            </svg>
          </a>
        </nav>
      </header>

      <section className="panel panel--params">
        <div className="panel__head">
          <h2 className="panel__label">Detection</h2>
          <span className="panel__meta num">{params.model_id}</span>
        </div>
        <div className="panel__body">
          <ParamsPanel
            modelId={params.model_id}
            conf={params.conf}
            imgsz={params.imgsz}
            classes={params.classes}
            onChange={setParams}
          />
        </div>
        <div className="panel__foot">
          <button className="run-button" onClick={handleRun} disabled={!canRun}>
            {starting && <span className="spinner" aria-hidden="true" />}
            {starting ? "Starting…" : "Run detection"}
          </button>
        </div>
      </section>

      <section className="panel panel--main">
        <div className="panel__head">
          <h2 className="panel__label">Preview</h2>
          {videoData && (
            <span className="panel__meta num">
              {videoData.width}×{videoData.height}
            </span>
          )}
        </div>
        <div className="stage">
          {!videoData && <UploadStep onUploaded={handleUploaded} />}

          {videoData && !result?.output_video_url && (
            <>
              {running ? (
                <div className="preview-stack">
                  {!streamLoaded && (
                    <div className="live-stream__loading">
                      <span
                        className="spinner spinner--lg"
                        aria-hidden="true"
                      />
                      <p>Starting live preview…</p>
                    </div>
                  )}
                  <img
                    className="live-stream"
                    src={jobStreamUrl(jobId)}
                    alt="Live run"
                    onLoad={() => setStreamLoaded(true)}
                  />
                </div>
              ) : (
                <div className="preview-stack">
                  <button
                    type="button"
                    className="preview-stack__close"
                    aria-label="Change video"
                    onClick={handleChangeVideo}
                  >
                    ✕
                  </button>
                  <LineCanvas
                    imageUrl={videoData.preview_frame_url}
                    width={videoData.width}
                    height={videoData.height}
                    lineY={params.line_y}
                    lineY2={params.line_y2}
                    colorA={lineColorA}
                    colorB={lineColorB}
                    thickness={lineThickness}
                    active={drawMode === "line"}
                    filter={previewFilter}
                    onChangeLine={(line_y) =>
                      setParams((p) => ({ ...p, line_y }))
                    }
                    onChangeLine2={(line_y2) =>
                      setParams((p) => ({ ...p, line_y2 }))
                    }
                  />
                  <RoiCanvas
                    width={videoData.width}
                    height={videoData.height}
                    roi={roi}
                    onChange={setRoi}
                    active={drawMode === "roi"}
                    color={roiColor}
                    thickness={roiThickness}
                    style={{
                      pointerEvents: drawMode === "roi" ? "auto" : "none",
                    }}
                  />
                  {vignette && <div className="vignette" style={vignette} />}
                </div>
              )}

              {!running && <AdjustPanel values={adjust} onChange={setAdjust} />}
              {!running && (
                <div
                  className="draw-mode-toggle"
                  role="group"
                  aria-label="Draw mode"
                >
                  <button
                    type="button"
                    aria-pressed={drawMode === "line"}
                    aria-label="Line tool"
                    title="Line"
                    className={drawMode === "line" ? "active" : ""}
                    onClick={() => {
                      setRoi(null);
                      setDrawMode("line");
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      aria-hidden="true"
                    >
                      <line
                        x1="3"
                        y1="8"
                        x2="21"
                        y2="8"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <line
                        x1="3"
                        y1="16"
                        x2="21"
                        y2="16"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-pressed={drawMode === "roi"}
                    aria-label="ROI tool"
                    title="ROI"
                    className={drawMode === "roi" ? "active" : ""}
                    onClick={() => setDrawMode("roi")}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      aria-hidden="true"
                    >
                      <rect
                        x="3.5"
                        y="5.5"
                        width="17"
                        height="13"
                        rx="1.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeDasharray="4 3"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </>
          )}

          {step === "results" && result?.output_video_url && (
            <video
              className="result-video"
              src={result.output_video_url}
              controls
              data-testid="result-video"
            />
          )}
        </div>

        {videoData && !result?.output_video_url && !running && (
          <div className="stage-rail">
            {drawMode === "line" && (
              <div className="line-style-toolbar">
                <label>
                  Line A
                  <input
                    type="color"
                    value={lineColorA}
                    onChange={(e) => setLineColorA(e.target.value)}
                  />
                </label>
                <ColorSwatches value={lineColorA} onChange={setLineColorA} />
                <label>
                  Line B
                  <input
                    type="color"
                    value={lineColorB}
                    onChange={(e) => setLineColorB(e.target.value)}
                  />
                </label>
                <ColorSwatches value={lineColorB} onChange={setLineColorB} />
                <label>
                  Thickness
                  <input
                    type="range"
                    min="1"
                    max="8"
                    value={lineThickness}
                    onChange={(e) => setLineThickness(Number(e.target.value))}
                  />
                </label>
              </div>
            )}
            {drawMode === "roi" && (
              <div className="line-style-toolbar">
                <label>
                  Color
                  <input
                    type="color"
                    value={roiColor}
                    onChange={(e) => setRoiColor(e.target.value)}
                  />
                </label>
                <ColorSwatches value={roiColor} onChange={setRoiColor} />
                <label>
                  Thickness
                  <input
                    type="range"
                    min="1"
                    max="8"
                    value={roiThickness}
                    onChange={(e) => setRoiThickness(Number(e.target.value))}
                  />
                </label>
              </div>
            )}
            <div className="preset-bar">
              <input
                type="text"
                placeholder="Preset name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
              />
              <button
                type="button"
                onClick={handleSavePreset}
                disabled={!presetName.trim()}
              >
                Save preset
              </button>
              <select
                value={selectedPreset}
                onChange={(e) => {
                  setSelectedPreset(e.target.value);
                  handleLoadPreset(e.target.value);
                }}
              >
                <option value="">Load preset…</option>
                {presetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div className="panel__status">
          {errorMessage && <p role="alert">{errorMessage}</p>}
          {running && (
            <RunStatus
              jobId={jobId}
              onProgress={handleProgress}
              onDone={handleDone}
              onError={handleError}
            />
          )}
          {!errorMessage && !running && (
            <p className="empty">
              {!videoData
                ? "Add a video to get started."
                : drawMode === "line"
                  ? "Drag lines A and B, then run."
                  : drawMode === "roi"
                    ? "Drag a box over the area to watch, then run."
                    : "Pick one tool — lines or ROI, not both."}
            </p>
          )}
        </div>
      </section>

      <section className="panel panel--result">
        <div className="panel__head">
          <h2 className="panel__label">Results</h2>
          {result && (
            <span className={`status-chip status-chip--${result.status}`}>
              {STATUS_LABEL[result.status] || result.status}
            </span>
          )}
        </div>
        <div className="panel__body">
          {result ? (
            <ResultsView result={result} onReset={handleReset} />
          ) : (
            <p className="empty">Counts appear here once a run starts.</p>
          )}
        </div>
      </section>
    </div>
  );
}
