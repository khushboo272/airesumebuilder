# 🐳 Docker, Kubernetes, Jenkins & CI/CD Deployment Guide

This guide provides instructions for containerizing, building, and deploying the **AI Resume Builder** application using Docker, Docker Compose, Kubernetes, Jenkins, and GitHub Actions.

---

## 📁 Architecture Overview

- **Backend Container**: Node.js 20 Express API running on port `5000`.
- **Frontend Container**: Multi-stage build (Vite + React) served by **Nginx** on port `80`, proxying `/api` requests to the Backend container.
- **Database**: MongoDB 7 (in-cluster StatefulSet for dev, or MongoDB Atlas for production).
- **Kubernetes**: Full orchestration with Deployments, Services, Ingress, HPA, ConfigMaps, and Secrets.
- **Jenkins Pipeline**: Automates linting, Docker builds, registry push, K8s deployment with approval gates.
- **GitHub Actions**: Automated PR testing, container builds, Docker Hub push, and K8s deployment.

---

## 🔧 Global Configuration (`deploy.env`)

All registry and image settings are centralized in a single file at the project root:

```env
# deploy.env — Single source of truth
DOCKER_REGISTRY=docker.io
DOCKER_USERNAME=khushboo272
BACKEND_IMAGE=docker.io/khushboo272/airesumebuilder-backend
FRONTEND_IMAGE=docker.io/khushboo272/airesumebuilder-frontend
K8S_NAMESPACE=airesume
```

**To change your Docker Hub username**, edit `deploy.env` — all pipelines (Jenkins, GitHub Actions) and the deploy script read from this file automatically. No need to edit multiple files.

---

## 🚀 Quick Start with Docker Compose

### 1. Production Mode
To launch the full production stack locally:

```bash
# Clone and navigate to root directory
cd airesumebuilder

# Copy & set your environment variables
# Backend environment settings
export GEMINI_API_KEY="your_actual_gemini_api_key"
export JWT_SECRET="your_secure_jwt_secret"

# Build and start containers in detached mode
docker-compose up --build -d
```

Access the application:
- **Frontend**: `http://localhost` (or `http://localhost:80`)
- **Backend API**: `http://localhost:5000/api/health`
- **MongoDB**: `localhost:27017`

To check logs and container status:
```bash
docker-compose ps
docker-compose logs -f backend
```

To stop and remove containers:
```bash
docker-compose down
```

---

### 2. Local Development Mode (Hot Reloading)

For containerized development with hot-reload enabled:

```bash
docker-compose -f docker-compose.dev.yml up --build
```

Access services:
- **Frontend Dev Server**: `http://localhost:5173`
- **Backend API**: `http://localhost:5000`

---

## ☸️ Kubernetes Deployment

### Prerequisites
1. **kubectl** installed and configured
2. **kustomize** installed (bundled with `kubectl` v1.14+)
3. **Nginx Ingress Controller** installed in your cluster
4. Docker images pushed to a container registry

### Cluster Setup (Local — Minikube)

```bash
# Start Minikube
minikube start --driver=docker --cpus=4 --memory=4096

# Enable Ingress addon
minikube addons enable ingress

# Enable metrics-server for HPA
minikube addons enable metrics-server
```

### Deploy using the Helper Script

The `scripts/deploy.sh` script reads config from `deploy.env` and handles the full deployment:

```bash
# Deploy latest images to dev
./scripts/deploy.sh dev

# Deploy a specific tag to production
./scripts/deploy.sh prod v1.2.3
```

### Deploy to Dev Environment (Manual)

```bash
# Apply dev overlay (1 replica each, in-cluster MongoDB)
kubectl apply -k k8s/overlays/dev/

# Verify all pods are running
kubectl -n airesume get pods -w

# Check services
kubectl -n airesume get svc

# Check Ingress
kubectl -n airesume get ingress
```

### Deploy to Production Environment

```bash
# 1. Create real secrets (do NOT use the placeholder secret.yaml)
kubectl create secret generic airesume-secrets \
  --namespace=airesume \
  --from-literal=MONGO_URI='mongodb+srv://your-atlas-connection-string' \
  --from-literal=JWT_SECRET='your-production-jwt-secret' \
  --from-literal=GEMINI_API_KEY='your-production-gemini-key' \
  --dry-run=client -o yaml | kubectl apply -f -

# 2. Update image tags to your registry
cd k8s/overlays/prod
kustomize edit set image \
  airesumebuilder-backend=your-registry/airesumebuilder-backend:v1.0.0 \
  airesumebuilder-frontend=your-registry/airesumebuilder-frontend:v1.0.0

# 3. Apply production overlay (3 replicas, TLS Ingress)
kubectl apply -k k8s/overlays/prod/

# 4. Watch rollout
kubectl -n airesume rollout status deployment/airesume-backend --timeout=180s
kubectl -n airesume rollout status deployment/airesume-frontend --timeout=180s
```

### Kubernetes Directory Structure

```
k8s/
├── base/                           # Shared manifests
│   ├── kustomization.yaml          # Kustomize config with image references
│   ├── namespace.yaml              # 'airesume' namespace
│   ├── configmap.yaml              # Non-secret env vars (NODE_ENV, PORT, etc.)
│   ├── secret.yaml                 # Secret template (PLACEHOLDER values only)
│   ├── backend-deployment.yaml     # Backend pods with health probes
│   ├── backend-service.yaml        # ClusterIP named 'backend' (matches nginx.conf)
│   ├── frontend-deployment.yaml    # Frontend pods (Nginx)
│   ├── frontend-service.yaml       # ClusterIP named 'frontend'
│   ├── mongodb-statefulset.yaml    # MongoDB with PVC (10Gi)
│   ├── mongodb-service.yaml        # Headless service for StatefulSet
│   ├── ingress.yaml                # Nginx Ingress routing rules
│   └── hpa.yaml                    # HorizontalPodAutoscaler (backend + frontend)
├── overlays/
│   ├── dev/                        # Dev: 1 replica, no TLS
│   └── prod/                       # Prod: 3 replicas, TLS via cert-manager
```

### Scaling

The HPA automatically scales pods based on CPU utilization:

| Service | Min Replicas | Max Replicas | CPU Target |
|---|---|---|---|
| Backend | 2 | 5 | 70% |
| Frontend | 2 | 4 | 70% |

Manual scaling:
```bash
kubectl -n airesume scale deployment/airesume-backend --replicas=4
```

### Rollback

```bash
# Rollback to previous revision
kubectl -n airesume rollout undo deployment/airesume-backend
kubectl -n airesume rollout undo deployment/airesume-frontend

# Rollback to a specific revision
kubectl -n airesume rollout undo deployment/airesume-backend --to-revision=2
```

---

## 🔐 Secrets Management

### Development / Local
Use the placeholder `k8s/base/secret.yaml` or create secrets manually:
```bash
kubectl -n airesume create secret generic airesume-secrets \
  --from-literal=MONGO_URI='mongodb://mongodb:27017/airesumebuilder' \
  --from-literal=JWT_SECRET='dev-secret' \
  --from-literal=GEMINI_API_KEY='your-dev-key'
```

### Production
**Never commit real secrets to Git.** Use one of:
- **kubectl create secret** (as shown above)
- **Sealed Secrets** (`kubeseal` encrypts secrets for Git storage)
- **External Secrets Operator** (syncs from AWS Secrets Manager, Vault, etc.)
- **Jenkins Credentials** (injected during pipeline deployment)

---

## 🛠 Jenkins Pipeline Setup

### Prerequisites
1. **Jenkins Server**: Installed with these plugins:
   - Docker Pipeline
   - Git
   - Kubernetes CLI (`withKubeConfig`)
   - Pipeline: Input Step
2. **Permissions**: Jenkins user added to the `docker` group (`sudo usermod -aG docker jenkins`)
3. **Jenkins Credentials** (configure in Jenkins → Manage Credentials):

| Credential ID | Type | Description |
|---|---|---|
| `docker-registry-url` | Secret text | Registry URL (e.g., `docker.io/yourusername`) |
| `docker-registry-credentials` | Username/Password | Registry login credentials |
| `kubeconfig-dev` | Secret file | kubeconfig for dev K8s cluster |
| `kubeconfig-prod` | Secret file | kubeconfig for prod K8s cluster |

### Creating the Pipeline Job
1. In Jenkins dashboard, click **New Item**.
2. Enter name `airesumebuilder-pipeline` and select **Pipeline**.
3. Under **Build Triggers**, enable **GitHub hook trigger for GITScm polling** (or Poll SCM).
4. Under **Pipeline**:
   - **Definition**: `Pipeline script from SCM`
   - **SCM**: `Git`
   - **Repository URL**: `https://github.com/your-org/airesumebuilder.git`
   - **Branch Specifier**: `*/main` or `*/dev`
   - **Script Path**: `Jenkinsfile`
5. Click **Save** and trigger a **Build Now**.

### Pipeline Stages

| # | Stage | Trigger | Description |
|---|---|---|---|
| 1 | Checkout | All branches | Clone repository |
| 2 | Code Quality | All branches | Parallel `npm ci` + lint |
| 3 | Unit Tests | All branches | Run `npm test` (skips if no test script) |
| 4 | Build Docker Images | All branches | Build with `BUILD_NUMBER` + `latest` tags |
| 5 | Push Docker Images | All branches | Push to configured container registry |
| 6 | Integration Health Check | All branches | Docker Compose stack + health verification |
| 7 | Deploy to Dev | `dev` branch | `kubectl apply -k k8s/overlays/dev/` |
| 8 | Deploy to Production | `main` branch | Manual approval → `kubectl apply -k k8s/overlays/prod/` |
| 9 | Smoke Test | `main`, `dev` | Health check with automatic rollback on failure |

---

## 🤖 GitHub Actions Workflow

The `.github/workflows/ci-cd.yml` automatically:
1. Runs code quality and dependency checks on every Push/PR.
2. Loads registry config from `deploy.env` (Docker Hub username, image names).
3. Builds Docker images and pushes to **Docker Hub** with build caching.
4. Tests the Docker Compose stack integration.
5. Deploys to production Kubernetes on push to `main` (requires `KUBE_CONFIG` secret).

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `DOCKERHUB_USERNAME` | Your Docker Hub username (e.g., `aaniket21`) |
| `DOCKERHUB_TOKEN` | Docker Hub access token ([create one here](https://hub.docker.com/settings/security)) |
| `KUBE_CONFIG` | Base64-encoded kubeconfig for production cluster |

---

## 🔐 Environment Variables Summary

| Variable | Description | Default / Example |
|---|---|---|
| `PORT` | Backend service port | `5000` |
| `MONGODB_URI` | Mongo connection string | `mongodb://mongodb:27017/airesumebuilder` |
| `NODE_ENV` | Environment mode | `production` |
| `JWT_SECRET` | Secret key for JWT auth signing | Set in production secrets |
| `GEMINI_API_KEY` | Google Gemini AI API key | Set in production secrets |

---

## 🧪 Verification & Health Monitoring

### Docker Compose
```bash
curl -i http://localhost:5000/api/health
# Expected: HTTP/1.1 200 OK  {"status":"ok","timestamp":"..."}
```

### Kubernetes
```bash
# Check all resources in the namespace
kubectl -n airesume get all

# Check pod logs
kubectl -n airesume logs -f deployment/airesume-backend

# Check pod events (troubleshooting)
kubectl -n airesume describe pod <pod-name>

# Port-forward for local testing
kubectl -n airesume port-forward svc/backend 5000:5000
curl http://localhost:5000/api/health

# Check HPA status
kubectl -n airesume get hpa

# Check Ingress
kubectl -n airesume describe ingress airesume-ingress
```

### Troubleshooting Common Issues

| Issue | Command | Solution |
|---|---|---|
| Pods stuck in `Pending` | `kubectl describe pod <name>` | Check resource limits, PVC binding |
| `ImagePullBackOff` | `kubectl describe pod <name>` | Verify registry credentials, image tags |
| Ingress not routing | `kubectl describe ingress` | Check IngressClass, host/path rules |
| HPA not scaling | `kubectl get hpa` | Ensure metrics-server is running |
| MongoDB connection refused | `kubectl logs <backend-pod>` | Check MONGO_URI secret, MongoDB pod status |
