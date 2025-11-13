/**
 * Roboflow WebRTC Secure Proxy Server
 *
 * This Express server acts as a secure proxy between your frontend and Roboflow's API.
 * Your API key stays on the server and is never exposed to the browser.
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { InferenceHTTPClient } from '@roboflow/inference-sdk';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

// Middleware
app.use(cors());
app.use(express.json());

/**
 * POST /api/init-webrtc
 *
 * Proxies WebRTC initialization to Roboflow while keeping the API key secure.
 *
 * Request body:
 *   - offer: { sdp, type }
 *   - wrtcParams: { workflowSpec, imageInputName, streamOutputNames, ... }
 *
 * Response:
 *   - sdp: string
 *   - type: string
 *   - context: { request_id, pipeline_id }
 */
app.post('/api/init-webrtc', async (req, res) => {
  try {
    const { offer, wrtcParams } = req.body;

    // Validate request
    if (!offer || !offer.sdp || !offer.type) {
      return res.status(400).json({
        error: 'Missing required field: offer with sdp and type'
      });
    }

    // Validate workflow configuration (either spec or identifier)
    const hasWorkflowSpec = wrtcParams?.workflowSpec;
    const hasWorkflowIdentifier = wrtcParams?.workspaceName && wrtcParams?.workflowId;

    if (!wrtcParams || (!hasWorkflowSpec && !hasWorkflowIdentifier)) {
      return res.status(400).json({
        error: 'Missing required field: wrtcParams must contain either workflowSpec OR (workspaceName + workflowId)'
      });
    }

    // Validate API key
    const apiKey = process.env.ROBOFLOW_API_KEY;
    if (!apiKey) {
      console.error('[Server] ROBOFLOW_API_KEY not set in environment');
      return res.status(500).json({
        error: 'Server configuration error: API key not configured'
      });
    }

    // Optional custom server URL
    const serverUrl = process.env.ROBOFLOW_SERVER_URL;

    console.log('[Server] Initializing WebRTC worker...');

    // Initialize Roboflow client
    const client = InferenceHTTPClient.init({
      apiKey,
      serverUrl
    });

    // Build workflow configuration (either spec or identifier)
    const workflowConfig = hasWorkflowSpec
      ? { workflowSpec: wrtcParams.workflowSpec }
      : { workspaceName: wrtcParams.workspaceName, workflowId: wrtcParams.workflowId };

    // Call Roboflow API
    const answer = await client.initializeWebrtcWorker({
      offer,
      ...workflowConfig,
      config: {
        imageInputName: wrtcParams.imageInputName,
        streamOutputNames: wrtcParams.streamOutputNames,
        dataOutputNames: wrtcParams.dataOutputNames,
        workflowParameters: wrtcParams.workflowParameters,
        threadPoolWorkers: wrtcParams.threadPoolWorkers
      }
    });

    console.log('[Server] WebRTC worker initialized:', {
      pipelineId: answer?.context?.pipeline_id
    });

    // Return answer to frontend
    res.json(answer);

  } catch (error) {
    console.error('[Server] Error initializing WebRTC worker:', error);

    res.status(500).json({
      error: error.message || 'Failed to initialize WebRTC worker'
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  const hasApiKey = !!process.env.ROBOFLOW_API_KEY;

  res.json({
    status: 'ok',
    apiKeyConfigured: hasApiKey,
    message: hasApiKey
      ? 'Server is ready'
      : 'Warning: ROBOFLOW_API_KEY not configured'
  });
});

// Setup Vite dev server or static files (AFTER API routes)
if (isDev) {
  // In development, use Vite's middleware for HMR and module resolution
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
    root: 'src'
  });
  app.use(vite.middlewares);
} else {
  // In production, serve from public/
  app.use(express.static('public'));
}

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Roboflow WebRTC Proxy Server ${isDev ? '(Development)' : '(Production)'}`);
  console.log(`   Local:    http://localhost:${PORT}`);
  console.log(`   API:      http://localhost:${PORT}/api/init-webrtc`);
  console.log(`   Health:   http://localhost:${PORT}/api/health`);
  console.log(`   Serving:  ${isDev ? 'src/ (via Vite)' : 'public/'}\n`);

  if (!process.env.ROBOFLOW_API_KEY) {
    console.warn('⚠️  Warning: ROBOFLOW_API_KEY not set in .env file\n');
  }
});
