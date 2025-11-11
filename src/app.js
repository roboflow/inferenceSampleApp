/**
 * Roboflow WebRTC Secure Streaming - Frontend
 *
 * This example uses connectors.withProxyUrl() to keep your API key secure.
 * All communication with Roboflow is proxied through the backend server.
 */

import { connectors } from 'inferencejs/inference-api';
import * as streams from 'inferencejs/streams';
import * as webrtc from 'inferencejs/webrtc';

// Get DOM elements
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const videoEl = document.getElementById("video");

// Track active connection
let activeConnection = null;

// Workflow specification for instance segmentation demo
const WORKFLOW_SPEC = {
  version: "1.0",
  inputs: [
    {
      type: "InferenceImage",
      name: "image"
    }
  ],
  steps: [
    {
      type: "roboflow_core/roboflow_instance_segmentation_model@v2",
      name: "model",
      images: "$inputs.image",
      model_id: "microsoft-coco-instance-segmentation/3"
    },
    {
      type: "roboflow_core/mask_visualization@v1",
      name: "mask_visualization",
      image: "$inputs.image",
      predictions: "$steps.model.predictions"
    },
    {
      type: "roboflow_core/label_visualization@v1",
      name: "label_visualization",
      image: "$steps.mask_visualization.image",
      predictions: "$steps.model.predictions"
    }
  ],
  outputs: [
    {
      type: "JsonField",
      name: "output_image",
      coordinates_system: "own",
      selector: "$steps.label_visualization.image"
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
async function connectToRoboflow(options = {}) {
  const {
    workflowSpec = WORKFLOW_SPEC,
    onData
  } = options;

  // Create connector that uses backend proxy (keeps API key secure)
  const connector = connectors.withProxyUrl('/api/init-webrtc');

  // Establish WebRTC connection
  const connection = await webrtc.use_stream({
    source: streams.useCamera({
      facingMode: "environment",
      width: 1280,
      height: 720
    }),
    connector: connector,
    wrtcparams: {
      workflowSpec: workflowSpec,
      imageInputName: "image",
      streamOutputNames: ["output_image"]
    },
    onData: onData
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
    const connection = await connectToRoboflow({
      onData: (data) => {
        console.log("[Data]", data);
      }
    });

    activeConnection = connection;

    // Get and display the processed video stream
    const remoteStream = await connection.remote_stream();
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
  }
}

// Attach event listeners
startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);

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
