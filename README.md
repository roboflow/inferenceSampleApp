# Roboflow WebRTC Secure Streaming Example

A production-ready example of real-time video streaming with Roboflow using WebRTC. This example demonstrates the **secure proxy pattern** where your API key stays on the backend server and is never exposed to the browser.

## Features

- 🔒 **Secure**: API key kept on backend, never exposed to frontend
- 🚀 **Production-Ready**: Proper error handling, health checks, and logging
- 📦 **Modern Stack**: Express backend + Vite frontend + InferenceJS from npm
- 🎥 **Real-Time**: WebRTC streaming for low-latency computer vision
- 🎨 **Instance Segmentation**: Demo workflow detecting and segmenting objects

## Architecture

```
Browser                    Your Server                 Roboflow API
┌─────────┐               ┌──────────┐               ┌──────────┐
│         │   WebRTC      │          │   WebRTC      │          │
│ Client  │◄─────────────►│  Proxy   │◄─────────────►│ Serverless│
│         │   Offer       │          │   + API Key   │          │
└─────────┘               └──────────┘               └──────────┘
```

The frontend uses `connectors.withProxyUrl('/api/init-webrtc')` which sends the WebRTC offer to your backend. Your backend adds the secret API key and forwards to Roboflow, keeping credentials secure.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This will install:
- `inferencejs` from GitHub (latest version)
- Express server dependencies
- Vite for frontend bundling

### 2. Configure API Key

Get your Roboflow API key from [https://app.roboflow.com/settings/api](https://app.roboflow.com/settings/api)

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add your API key:

```env
ROBOFLOW_API_KEY=your_api_key_here
```

### 3. Run in Development Mode

```bash
npm run dev
```

This runs both:
- Vite dev server on `http://localhost:5173` (frontend with HMR)
- Express API server on `http://localhost:3000` (backend proxy)

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Build for Production

```bash
npm run build
npm start
```

- `npm run build` compiles the frontend to `public/`
- `npm start` runs Express in production mode, serving built files

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
sampleApp/
├── server.js              # Express backend with /api/init-webrtc proxy
├── vite.config.js         # Vite build configuration
├── package.json           # Dependencies and scripts
├── .env                   # Your API key (create from .env.example)
├── .env.example           # Template for environment variables
├── .gitignore             # Git ignore rules
├── src/
│   ├── index.html         # Frontend UI
│   └── app.js             # Frontend logic (imports from npm)
└── public/                # Built frontend (auto-generated)
```

## API Endpoints

### `POST /api/init-webrtc`

Proxies WebRTC initialization to Roboflow.

**Request:**
```json
{
  "offer": {
    "sdp": "...",
    "type": "offer"
  },
  "wrtcparams": {
    "workflowSpec": { ... },
    "imageInputName": "image",
    "streamOutputNames": ["output_image"]
  }
}
```

**Response:**
```json
{
  "sdp": "...",
  "type": "answer",
  "context": {
    "pipeline_id": "abc123",
    "request_id": "xyz789"
  }
}
```

### `GET /api/health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "apiKeyConfigured": true,
  "message": "Server is ready"
}
```

## Deployment

### Deploy to Vercel

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

3. Set environment variable in Vercel dashboard:
   - Go to your project settings
   - Add `ROBOFLOW_API_KEY` environment variable
   - Redeploy

### Deploy to Heroku

1. Install Heroku CLI and login:
```bash
heroku login
```

2. Create app:
```bash
heroku create your-app-name
```

3. Set environment variable:
```bash
heroku config:set ROBOFLOW_API_KEY=your_api_key_here
```

4. Deploy:
```bash
git push heroku main
```

### Deploy to Any VPS (DigitalOcean, AWS, etc.)

1. SSH into your server
2. Clone your repository
3. Install Node.js (v18+)
4. Create `.env` file with your API key
5. Run:
```bash
npm install
npm run build
npm start
```

6. Use PM2 for process management:
```bash
npm install -g pm2
pm2 start server.js --name roboflow-webrtc
pm2 save
pm2 startup
```

7. Setup nginx as reverse proxy (optional):
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Deploy with Docker

1. Create `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "server.js"]
```

2. Create `.dockerignore`:
```
node_modules
.env
public
.git
```

3. Build and run:
```bash
docker build -t roboflow-webrtc .
docker run -p 3000:3000 -e ROBOFLOW_API_KEY=your_key roboflow-webrtc
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ROBOFLOW_API_KEY` | ✅ Yes | - | Your Roboflow API key |
| `ROBOFLOW_SERVER_URL` | ❌ No | `https://serverless.roboflow.one` | Custom Roboflow server URL |
| `PORT` | ❌ No | `3000` | Server port |

## Security Best Practices

✅ **DO:**
- Keep `.env` file in `.gitignore`
- Use environment variables for API keys
- Use HTTPS in production
- Validate requests on the backend
- Rate limit your API endpoints
- Use CORS properly

❌ **DON'T:**
- Commit API keys to git
- Expose API keys in frontend code
- Use `connectors.withApiKey()` in production
- Skip input validation
- Allow unrestricted access to proxy endpoint

## Customizing the Workflow

Edit `src/app.js` to change the workflow specification:

```javascript
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
      type: "roboflow_core/roboflow_object_detection_model@v2",
      name: "model",
      images: "$inputs.image",
      model_id: "your-project/your-version"
    }
    // Add more steps...
  ],
  outputs: [
    {
      type: "JsonField",
      name: "output_image",
      selector: "$steps.model.predictions"
    }
  ]
};
```

Learn more about workflows: [https://docs.roboflow.com/workflows](https://docs.roboflow.com/workflows)

## Troubleshooting

### "Server configuration error: API key not configured"

Make sure you created a `.env` file with `ROBOFLOW_API_KEY`:
```bash
cp .env.example .env
# Edit .env and add your API key
```

### "Failed to initialize WebRTC worker"

Check server logs for errors. Common issues:
- Invalid API key
- Network connectivity issues
- Invalid workflow specification

### Camera not working

- Check browser permissions
- Use HTTPS in production (required for camera access)
- Try a different browser

### Vite dev mode: "Failed to fetch dynamically imported module"

Make sure both servers are running:
```bash
npm run dev  # Runs both Vite and Express
```

## Learn More

- [Roboflow Documentation](https://docs.roboflow.com)
- [InferenceJS GitHub](https://github.com/roboflow/inferencejs)
- [Workflows Documentation](https://docs.roboflow.com/workflows)
- [WebRTC API Reference](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)

## License

MIT

## Support

- GitHub Issues: [https://github.com/roboflow/inferencejs/issues](https://github.com/roboflow/inferencejs/issues)
- Roboflow Forum: [https://discuss.roboflow.com](https://discuss.roboflow.com)
- Email: support@roboflow.com
