# Roboflow inferencejs sample app (realtime video processing)

## Overview

This is a sample application demonstrates how easy it is to integrate Roboflow's video capabilities in your own sloutions. 

It showcases how you can stream a video from your webcam through your custom computer vision workflows and display the result on your web application in realtime.

## How to run

* add your Roboflow API key to the `.env` file
* Optional: change `ROBOFLOW_SERVER_URL` to a different server url
* `npm ci && npm run dev`
* Open http://localhost:3000


## How to Integrate

```
Browser                    Your Server                 Roboflow API
┌─────────┐               ┌──────────┐               ┌──────────┐
│         │   WebRTC      │          │   WebRTC      │          │
│ Client  │◄─────────────►│  Proxy   │◄─────────────►│ Serverless│
│         │   Offer       │          │   + API Key   │          │
└─────────┘               └──────────┘               └──────────┘
```

### 1. Install the client library

```bash
npm install @roboflow/inference-sdk
```

### 2. Frontend: Connect to your webcam and start streaming

```javascript
import { connectors, webrtc, streams } from '@roboflow/inference-sdk';

// Define your workflow specification
const workflowSpec = {
  version: "1.0",
  inputs: [{ type: "InferenceImage", name: "image" }],
  steps: [
    {
      type: "roboflow_core/roboflow_instance_segmentation_model@v2",
      name: "model",
      images: "$inputs.image",
      model_id: "your-model-id"
    }
  ],
  outputs: [
    {
      type: "JsonField",
      name: "output_image",
      selector: "$steps.model.predictions"
    }
  ]
};

// Create a connector pointing to your backend proxy
const connector = connectors.withProxyUrl('/api/init-webrtc');

// Start the stream
const connection = await webrtc.useStream({
  source: await streams.useCamera({ video: true, audio: false }),
  connector: connector,
  wrtcParams: {
    workflowSpec: workflowSpec,
    imageInputName: "image",
    streamOutputNames: ["output_image"],
    dataOutputNames: ["your_data_output"]  // Optional: for receiving data outputs
  },
  onData: (data) => {
    // Handle data outputs from your workflow (e.g., detection counts, metrics)
    console.log("Received data:", data);
  }
});

// Display the processed video
const remoteStream = await connection.remoteStream();
videoElement.srcObject = remoteStream;
```

### 3. Backend: Create a proxy endpoint

Your backend needs to proxy the WebRTC initialization request to the Roboflow inference server while keeping your API key secure.

```javascript
import express from 'express';
import { InferenceHTTPClient } from '@roboflow/inference-sdk';

const app = express();
app.use(express.json());

app.post('/api/init-webrtc', async (req, res) => {
  const { offer, wrtcParams } = req.body;

  // Initialize client with your API key (stored securely on the server)
  const client = InferenceHTTPClient.init({
    apiKey: process.env.ROBOFLOW_API_KEY
  });

  // Forward the request to Roboflow
  const answer = await client.initializeWebrtcWorker({
    offer,
    workflowSpec: wrtcParams.workflowSpec,
    config: {
      imageInputName: wrtcParams.imageInputName,
      streamOutputNames: wrtcParams.streamOutputNames
    }
  });

  res.json(answer);
});
```

That's it! Your frontend will now stream video through your custom workflows and display the processed results.

