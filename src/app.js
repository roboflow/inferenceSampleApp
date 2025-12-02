/**
 * Roboflow WebRTC Secure Streaming - Frontend
 *
 * This example uses connectors.withProxyUrl() to keep your API key secure.
 * All communication with Roboflow is proxied through the backend server.
 */

import { connectors, webrtc, streams } from '@roboflow/inference-sdk';

// Get DOM elements
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const videoEl = document.getElementById("video");
const dataPreviewEl = document.getElementById("dataPreview");
const dataCountEl = document.getElementById("dataCount");

// Data channel message counter
let dataMessageCount = 0;

// Config inputs - Workflow (Custom tab)
const configInputs = {
  workspaceName: document.getElementById("workspaceName"),
  workflowId: document.getElementById("workflowId"),
  imageInputName: document.getElementById("imageInputName"),
  streamOutputNames: document.getElementById("streamOutputNames"),
  dataOutputNames: document.getElementById("dataOutputNames")
};

// Config inputs - Example tab
const exampleInputs = {
  streamOutput: document.getElementById("exampleStreamOutput")
};

// Config inputs - Server settings
const serverInputs = {
  requestedRegion: document.getElementById("requestedRegion"),
  requestedPlan: document.getElementById("requestedPlan"),
  processingTimeout: document.getElementById("processingTimeout")
};

// Tab elements
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

// Current workflow mode: "example" or "custom"
let workflowMode = "example";

// Config inputs - Camera
const cameraInputs = {
  cameraSelect: document.getElementById("cameraSelect"),
  resolutionSelect: document.getElementById("resolutionSelect"),
  fpsSelect: document.getElementById("fpsSelect"),
  cameraCaps: document.getElementById("cameraCaps")
};

// Track active connection
let activeConnection = null;

// Store camera capabilities
let cameraCapabilities = null;

/**
 * Get server configuration
 */
function getServerConfig() {
  return {
    requestedRegion: serverInputs.requestedRegion?.value || "us",
    requestedPlan: serverInputs.requestedPlan?.value || "webrtc-gpu-small",
    processingTimeout: parseInt(serverInputs.processingTimeout?.value) || 600
  };
}

/**
 * Get current workflow configuration based on selected mode
 */
function getConfig() {
  const serverConfig = getServerConfig();
  
  if (workflowMode === "example") {
    // Example mode: use hardcoded workflow spec
    const streamOutput = exampleInputs.streamOutput?.value || "labels";
    return {
      mode: "example",
      workflowSpec: WORKFLOW_SPEC,
      imageInputName: "image",
      streamOutputNames: [streamOutput],
      dataOutputNames: ["count"],
      ...serverConfig
    };
  } else {
    // Custom mode: use user-provided workspace + workflow ID
    const workspaceName = configInputs.workspaceName?.value?.trim();
    const workflowId = configInputs.workflowId?.value?.trim();
    
    if (!workspaceName || !workflowId) {
      throw new Error("Please enter both Workspace Name and Workflow ID");
    }
    
    return {
      mode: "custom",
      workspaceName,
      workflowId,
      imageInputName: configInputs.imageInputName?.value?.trim() || "image",
      streamOutputNames: (configInputs.streamOutputNames?.value?.trim() || "output_image")
        .split(",").map(s => s.trim()).filter(Boolean),
      dataOutputNames: (configInputs.dataOutputNames?.value?.trim() || "predictions")
        .split(",").map(s => s.trim()).filter(Boolean),
      ...serverConfig
    };
  }
}

/**
 * Switch workflow tab
 */
function switchTab(tabName) {
  workflowMode = tabName;
  
  // Update tab buttons
  tabBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  
  // Update tab content
  tabContents.forEach(content => {
    content.classList.toggle("active", content.id === `tab-${tabName}`);
  });
}

/**
 * Get current camera configuration from form inputs
 */
function getCameraConfig() {
  const resolution = cameraInputs.resolutionSelect?.value?.split("x") || [];
  const fps = parseInt(cameraInputs.fpsSelect?.value) || 30;
  
  return {
    deviceId: cameraInputs.cameraSelect?.value || undefined,
    width: resolution[0] ? parseInt(resolution[0]) : 640,
    height: resolution[1] ? parseInt(resolution[1]) : 480,
    frameRate: fps
  };
}

/**
 * Enumerate available video input devices (cameras)
 */
async function enumerateCameras() {
  try {
    // Request permission first to get device labels
    const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
    tempStream.getTracks().forEach(track => track.stop());
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(device => device.kind === "videoinput");
    
    console.log("[Camera] Found devices:", cameras);
    
    // Populate camera dropdown
    cameraInputs.cameraSelect.innerHTML = "";
    
    if (cameras.length === 0) {
      cameraInputs.cameraSelect.innerHTML = '<option value="">No cameras found</option>';
      return;
    }
    
    cameras.forEach((camera, index) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.textContent = camera.label || `Camera ${index + 1}`;
      cameraInputs.cameraSelect.appendChild(option);
    });
    
    cameraInputs.cameraSelect.disabled = false;
    
    // Automatically get capabilities for first camera
    if (cameras.length > 0) {
      await getCameraCapabilities(cameras[0].deviceId);
    }
    
  } catch (err) {
    console.error("[Camera] Failed to enumerate devices:", err);
    cameraInputs.cameraSelect.innerHTML = '<option value="">Camera access denied</option>';
    cameraInputs.cameraCaps.textContent = "Grant camera permission to see available devices";
  }
}

/**
 * Get capabilities (resolutions, frame rates) for a specific camera
 */
async function getCameraCapabilities(deviceId) {
  cameraInputs.cameraCaps.textContent = "Detecting capabilities...";
  cameraInputs.cameraCaps.classList.add("loading");
  cameraInputs.resolutionSelect.disabled = true;
  cameraInputs.fpsSelect.disabled = true;
  
  try {
    // Get a stream from the specific device to access capabilities
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } }
    });
    
    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities();
    const settings = track.getSettings();
    
    console.log("[Camera] Capabilities:", capabilities);
    console.log("[Camera] Current settings:", settings);
    
    // Store capabilities
    cameraCapabilities = capabilities;
    
    // Stop the stream
    stream.getTracks().forEach(t => t.stop());
    
    // Populate resolution dropdown
    populateResolutions(capabilities, settings);
    
    // Populate FPS dropdown
    populateFrameRates(capabilities, settings);
    
    // Show capability summary
    const summary = [];
    if (capabilities.width && capabilities.height) {
      summary.push(`${capabilities.width.min}×${capabilities.height.min} - ${capabilities.width.max}×${capabilities.height.max}`);
    }
    if (capabilities.frameRate) {
      summary.push(`${capabilities.frameRate.min}-${capabilities.frameRate.max} fps`);
    }
    cameraInputs.cameraCaps.textContent = summary.join(" • ") || "Capabilities detected";
    cameraInputs.cameraCaps.classList.remove("loading");
    
  } catch (err) {
    console.error("[Camera] Failed to get capabilities:", err);
    cameraInputs.cameraCaps.textContent = "Failed to detect capabilities";
    cameraInputs.cameraCaps.classList.remove("loading");
    
    // Set default options
    setDefaultCameraOptions();
  }
}

/**
 * Generate common resolutions within camera capabilities
 */
function populateResolutions(capabilities, currentSettings) {
  const commonResolutions = [
    { w: 3840, h: 2160, label: "4K (3840×2160)" },
    { w: 2560, h: 1440, label: "QHD (2560×1440)" },
    { w: 1920, h: 1080, label: "1080p (1920×1080)" },
    { w: 1280, h: 720, label: "720p (1280×720)" },
    { w: 854, h: 480, label: "480p (854×480)" },
    { w: 640, h: 480, label: "VGA (640×480)" },
    { w: 640, h: 360, label: "360p (640×360)" },
    { w: 320, h: 240, label: "QVGA (320×240)" }
  ];
  
  cameraInputs.resolutionSelect.innerHTML = "";
  
  const maxW = capabilities.width?.max || 1920;
  const maxH = capabilities.height?.max || 1080;
  const minW = capabilities.width?.min || 320;
  const minH = capabilities.height?.min || 240;
  
  // Filter resolutions that fit within camera capabilities
  const availableResolutions = commonResolutions.filter(
    res => res.w >= minW && res.w <= maxW && res.h >= minH && res.h <= maxH
  );
  
  // Add "Max" option if it's not a standard resolution
  const maxIsStandard = availableResolutions.some(r => r.w === maxW && r.h === maxH);
  if (!maxIsStandard && maxW && maxH) {
    availableResolutions.unshift({ w: maxW, h: maxH, label: `Max (${maxW}×${maxH})` });
  }
  
  if (availableResolutions.length === 0) {
    availableResolutions.push({ w: 640, h: 480, label: "VGA (640×480)" });
  }
  
  availableResolutions.forEach(res => {
    const option = document.createElement("option");
    option.value = `${res.w}x${res.h}`;
    option.textContent = res.label;
    cameraInputs.resolutionSelect.appendChild(option);
  });
  
  // Select current or closest resolution
  const currentRes = `${currentSettings.width}x${currentSettings.height}`;
  const hasCurrentRes = availableResolutions.some(r => `${r.w}x${r.h}` === currentRes);
  
  if (hasCurrentRes) {
    cameraInputs.resolutionSelect.value = currentRes;
  } else {
    // Default to 720p or first available
    const default720 = availableResolutions.find(r => r.w === 1280 && r.h === 720);
    if (default720) {
      cameraInputs.resolutionSelect.value = "1280x720";
    }
  }
  
  cameraInputs.resolutionSelect.disabled = false;
}

/**
 * Generate frame rate options within camera capabilities
 */
function populateFrameRates(capabilities, currentSettings) {
  const commonFps = [60, 30, 24, 15, 10];
  
  cameraInputs.fpsSelect.innerHTML = "";
  
  const maxFps = capabilities.frameRate?.max || 30;
  const minFps = capabilities.frameRate?.min || 1;
  
  // Filter FPS values that fit within camera capabilities
  const availableFps = commonFps.filter(fps => fps >= minFps && fps <= maxFps);
  
  // Add max if not standard
  if (!availableFps.includes(Math.floor(maxFps)) && maxFps > 0) {
    availableFps.unshift(Math.floor(maxFps));
  }
  
  // Sort descending
  availableFps.sort((a, b) => b - a);
  
  if (availableFps.length === 0) {
    availableFps.push(30);
  }
  
  availableFps.forEach(fps => {
    const option = document.createElement("option");
    option.value = fps;
    option.textContent = `${fps} fps`;
    cameraInputs.fpsSelect.appendChild(option);
  });
  
  // Select current or default to 30fps
  const currentFps = Math.round(currentSettings.frameRate);
  if (availableFps.includes(currentFps)) {
    cameraInputs.fpsSelect.value = currentFps;
  } else if (availableFps.includes(30)) {
    cameraInputs.fpsSelect.value = 30;
  }
  
  cameraInputs.fpsSelect.disabled = false;
}

/**
 * Set default camera options when capabilities can't be detected
 */
function setDefaultCameraOptions() {
  cameraInputs.resolutionSelect.innerHTML = `
    <option value="1920x1080">1080p (1920×1080)</option>
    <option value="1280x720" selected>720p (1280×720)</option>
    <option value="640x480">VGA (640×480)</option>
  `;
  cameraInputs.fpsSelect.innerHTML = `
    <option value="30" selected>30 fps</option>
    <option value="24">24 fps</option>
    <option value="15">15 fps</option>
  `;
  cameraInputs.resolutionSelect.disabled = false;
  cameraInputs.fpsSelect.disabled = false;
}

// Workflow specification for object detection demo
const WORKFLOW_SPEC = {
  "version": "1.0",
  "inputs": [
    {
      "type": "InferenceImage",
      "name": "image"
    }
  ],
  "steps": [
    {
      "type": "roboflow_core/roboflow_object_detection_model@v2",
      "name": "model",
      "images": "$inputs.image",
      "model_id": "rfdetr-nano"
    },
    {
      "type": "roboflow_core/blur_visualization@v1",
      "name": "blur_visualization",
      "image": "$inputs.image",
      "predictions": "$steps.model.predictions"
    },
    {
      "type": "roboflow_core/bounding_box_visualization@v1",
      "name": "bounding_box_visualization",
      "image": "$inputs.image",
      "predictions": "$steps.model.predictions"
    },
    {
      "type": "roboflow_core/label_visualization@v1",
      "name": "label_visualization",
      "image": "$steps.bounding_box_visualization.image",
      "predictions": "$steps.model.predictions"
    },
    {
      "type": "roboflow_core/property_definition@v1",
      "name": "property_definition",
      "data": "$steps.model.predictions",
      "operations": [
        { "type": "SequenceLength" }
      ]
    }
  ],
  "outputs": [
    {
      "type": "JsonField",
      "name": "blur",
      "coordinates_system": "own",
      "selector": "$steps.blur_visualization.image"
    },
    {
      "type": "JsonField",
      "name": "labels",
      "coordinates_system": "own",
      "selector": "$steps.label_visualization.image"
    },
    {
      "type": "JsonField",
      "name": "count",
      "coordinates_system": "own",
      "selector": "$steps.property_definition.output"
    }
  ]
};

/**
 * Update status display
 */
function setStatus(text) {
  statusEl.textContent = text;
  console.log("[UI Status]", text);
}

/**
 * Connect to Roboflow WebRTC streaming using secure proxy
 *
 * @param {Object} options - Connection options
 * @param {Object} [options.workflowSpec] - Workflow specification
 * @param {Function} [options.onData] - Callback for data channel messages
 * @returns {Promise<RFWebRTCConnection>} WebRTC connection object
 */
async function connectWebcamToRoboflowWebRTC(options = {}) {
  const { onData } = options;

  // Get configuration from forms
  const config = getConfig();
  const cameraConfig = getCameraConfig();
  
  console.log("[Config] Workflow:", config);
  console.log("[Config] Camera:", cameraConfig);

  // Create connector that uses backend proxy (keeps API key secure)
  const connector = connectors.withProxyUrl('/api/init-webrtc');

  // Build video constraints from camera config
  const videoConstraints = {
    width: { ideal: cameraConfig.width },
    height: { ideal: cameraConfig.height },
    frameRate: { ideal: cameraConfig.frameRate, max: cameraConfig.frameRate }
  };
  
  // Add device ID if selected
  if (cameraConfig.deviceId) {
    videoConstraints.deviceId = { exact: cameraConfig.deviceId };
  } else {
    videoConstraints.facingMode = { ideal: "environment" };
  }

  // Build wrtcParams based on mode
  const baseParams = {
    imageInputName: config.imageInputName,
    streamOutputNames: config.streamOutputNames,
    dataOutputNames: config.dataOutputNames,
    requestedRegion: config.requestedRegion,
    requestedPlan: config.requestedPlan,
    processingTimeout: config.processingTimeout
  };

  const wrtcParams = config.mode === "example"
    ? { ...baseParams, workflowSpec: config.workflowSpec }
    : { ...baseParams, workspaceName: config.workspaceName, workflowId: config.workflowId };

  // Establish WebRTC connection
  const connection = await webrtc.useStream({
    source: await streams.useCamera({
      video: videoConstraints,
      audio: false
    }),
    connector: connector,
    wrtcParams: wrtcParams,
    onData: onData,
    options: {
      disableInputStreamDownscaling: true
    }
  });

  return connection;
}

/**
 * Start WebRTC streaming with Roboflow
 */
async function start() {
  if (activeConnection) {
    console.warn("Already connected");
    return;
  }

  // Disable start button while connecting
  startBtn.disabled = true;
  setStatus("Connecting...");

  try {
    // Connect to Roboflow via backend proxy
    const connection = await connectWebcamToRoboflowWebRTC({
      onData: (data) => {
        console.log("[Data]", data);
        // Update data preview
        dataMessageCount++;
        dataCountEl.textContent = dataMessageCount;
        dataPreviewEl.textContent = JSON.stringify(data, null, 2);
      }
    });

    activeConnection = connection;

    // Get and display the processed video stream
    const remoteStream = await connection.remoteStream();
    videoEl.srcObject = remoteStream;
    videoEl.controls = false;

    // Ensure video plays
    try {
      await videoEl.play();
      console.log("[UI] Video playing");
    } catch (err) {
      console.warn("[UI] Autoplay failed:", err);
    }

    // Update UI
    setStatus("Connected - Processing video");
    stopBtn.disabled = false;

    console.log("[UI] Successfully connected!");

  } catch (err) {
    console.error("[UI] Connection failed:", err);

    // Handle specific errors
    if (err.message.includes('API key')) {
      setStatus("Error: Server API key not configured");
      alert("Server configuration error. Please check that ROBOFLOW_API_KEY is set in the .env file.");
    } else {
      setStatus(`Error: ${err.message}`);
    }

    startBtn.disabled = false;
    activeConnection = null;
  }
}

/**
 * Stop video processing and cleanup
 */
async function stop() {
  if (!activeConnection) {
    return;
  }

  stopBtn.disabled = true;
  setStatus("Stopping...");

  try {
    await activeConnection.cleanup();
    console.log("[UI] Cleanup complete");
  } catch (err) {
    console.error("[UI] Cleanup error:", err);
  } finally {
    // Reset UI
    activeConnection = null;
    videoEl.srcObject = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    setStatus("Idle");
    // Reset data preview
    dataMessageCount = 0;
    dataCountEl.textContent = "0";
    dataPreviewEl.textContent = "";
  }
}

// Attach event listeners
startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);

// Tab switching
tabBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);
  });
});

// Camera selection change handler
cameraInputs.cameraSelect.addEventListener("change", async (e) => {
  const deviceId = e.target.value;
  if (deviceId) {
    await getCameraCapabilities(deviceId);
  }
});

// Initialize camera enumeration on load
enumerateCameras();

// Cleanup on page unload
window.addEventListener("pagehide", () => {
  if (activeConnection) {
    activeConnection.cleanup();
  }
});

window.addEventListener("beforeunload", () => {
  if (activeConnection) {
    activeConnection.cleanup();
  }
});

// Check server health on load
fetch('/api/health')
  .then(res => res.json())
  .then(data => {
    console.log('[UI] Server health:', data);
    if (!data.apiKeyConfigured) {
      console.warn('[UI] Warning: Server API key not configured');
    }
  })
  .catch(err => {
    console.error('[UI] Failed to check server health:', err);
  });
