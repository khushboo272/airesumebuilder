# ✅ Audit Complete + How to Run Guide

## Audit Results

I reviewed all **23 files** in the K8s + Jenkins setup. Everything is correct.

| Area | Files Checked | Status |
|---|---|---|
| K8s Base Manifests | 12 files | ✅ All valid |
| Kustomize Overlays | 5 files | ✅ All valid |
| Jenkinsfile | 1 file | ✅ deploy.env loading works |
| GitHub Actions | 1 file | ✅ deploy.env loading works |
| Dockerfiles | 2 files | ✅ Labels + build-arg added |
| Global Config | 1 file (deploy.env) | ✅ Consistent values |
| Deploy Script | 1 file | ✅ Reads from deploy.env |

**2 minor fixes applied during audit:**
- Removed trailing whitespace in [ingress.yaml](file:///d:/airesumebuilder/k8s/base/ingress.yaml) (line 22)
- Removed leftover blank lines at top of [secret.yaml](file:///d:/airesumebuilder/k8s/base/secret.yaml)

---

## How to Check & Run — Step by Step

### Prerequisites

You need these tools installed on your machine:

| Tool | Install Command | Verify |
|---|---|---|
| **Docker Desktop** | [Download](https://www.docker.com/products/docker-desktop/) | `docker --version` |
| **kubectl** | `winget install Kubernetes.kubectl` | `kubectl version --client` |
| **Minikube** | `winget install Kubernetes.minikube` | `minikube version` |

> [!NOTE]
> Docker Desktop for Windows includes Kubernetes support built-in. You can either use that or install Minikube separately.

---

### Step 1: Build & Push Docker Images to Docker Hub

```bash
# Login to Docker Hub
docker login -u aaniket21

# Build images
docker build -t docker.io/aaniket21/airesumebuilder-backend:latest ./backend
docker build -t docker.io/aaniket21/airesumebuilder-frontend:latest ./frontend

# Push to Docker Hub
docker push docker.io/aaniket21/airesumebuilder-backend:latest
docker push docker.io/aaniket21/airesumebuilder-frontend:latest
```

---

### Step 2: Start a Local Kubernetes Cluster (Minikube)

```bash
# Start Minikube with resources (adjusting memory to fit within Docker Desktop limits)
minikube start --driver=docker --cpus=2 --memory=3072

# Enable required addons
minikube addons enable ingress
minikube addons enable metrics-server

# Verify cluster is running
kubectl cluster-info
```

---

### Step 3: Deploy to Dev Environment

```bash
# Apply all K8s manifests (dev overlay = 1 replica each)
kubectl apply -k k8s/overlays/dev/

# Watch pods come up (wait until all show Running + Ready)
kubectl -n airesume get pods -w
```

**Expected output** (after ~30-60 seconds):
```
NAME                                 READY   STATUS    RESTARTS   AGE
airesume-backend-xxxxx-yyyyy         1/1     Running   0          45s
airesume-frontend-xxxxx-yyyyy        1/1     Running   0          45s
mongodb-0                            1/1     Running   0          45s
```

> [!IMPORTANT]
> If pods show `ImagePullBackOff`, it means the images aren't on Docker Hub yet. Run Step 1 first.

---

### Step 4: Verify Everything Works

```bash
# Check all resources in the namespace
kubectl -n airesume get all

# Check services
kubectl -n airesume get svc

# Check Ingress
kubectl -n airesume get ingress

# Check HPA
kubectl -n airesume get hpa

# Check pod logs (backend)
kubectl -n airesume logs -f deployment/airesume-backend

# Check pod logs (frontend)
kubectl -n airesume logs -f deployment/airesume-frontend
```

---

### Step 5: Access the Application

**Option A — Port Forward (simplest):**
```bash
# Forward frontend to localhost:8080
kubectl -n airesume port-forward svc/frontend 8080:80

# In another terminal, forward backend API
kubectl -n airesume port-forward svc/backend 5000:5000
```
Then open:
- 🌐 **Frontend**: http://localhost:8080
- 🔌 **Backend Health**: http://localhost:5000/api/health

**Option B — Minikube Tunnel (uses Ingress):**
```bash
# Start the tunnel (requires admin/sudo)
minikube tunnel
```
Then add this line to your hosts file (`C:\Windows\System32\drivers\etc\hosts`):
```
127.0.0.1  airesume.local
```
Now open: http://airesume.local

---

### Step 6: Test the Health Endpoint

```bash
# Via port-forward (after Step 5 Option A)
curl http://localhost:5000/api/health

# Expected response:
# {"status":"ok","uptime":42.123,"db":"connected","timestamp":"2026-08-05T..."}
```

---

### Step 7: Test Scaling (HPA)

```bash
# Check current HPA status
kubectl -n airesume get hpa

# Manually scale backend to 3 replicas
kubectl -n airesume scale deployment/airesume-backend --replicas=3

# Watch pods scale up
kubectl -n airesume get pods -w

# Scale back down
kubectl -n airesume scale deployment/airesume-backend --replicas=1
```

---

### Step 8: Test Rolling Update (Zero Downtime)

```bash
# Trigger a rolling update by changing the image tag
kubectl -n airesume set image deployment/airesume-backend backend=docker.io/aaniket21/airesumebuilder-backend:latest

# Watch the rollout progress
kubectl -n airesume rollout status deployment/airesume-backend

# If something goes wrong, rollback
kubectl -n airesume rollout undo deployment/airesume-backend
```

---

### Step 9: Cleanup / Tear Down

```bash
# Delete all resources in the namespace
kubectl delete -k k8s/overlays/dev/

# Or delete just the namespace (removes everything inside it)
kubectl delete namespace airesume

# Stop Minikube
minikube stop
```

---

## Jenkins Setup (When Ready)

1. Install Jenkins with **Docker Pipeline**, **Git**, and **Kubernetes CLI** plugins
2. Add these credentials in Jenkins → Manage Credentials:

| Credential ID | Type | Value |
|---|---|---|
| `docker-registry-credentials` | Username/Password | Docker Hub login |
| `kubeconfig-dev` | Secret file | Your dev cluster kubeconfig |
| `kubeconfig-prod` | Secret file | Your prod cluster kubeconfig |

3. Create a Pipeline job pointing to your repo's `Jenkinsfile`
4. Trigger a build — it reads everything from `deploy.env` automatically

---

## GitHub Actions Setup (When Ready)

1. Go to your repo → **Settings → Secrets and variables → Actions**
2. Add these secrets:

| Secret Name | Value |
|---|---|
| `DOCKERHUB_USERNAME` | `aaniket21` |
| `DOCKERHUB_TOKEN` | [Create access token](https://hub.docker.com/settings/security) |
| `KUBE_CONFIG` | `cat ~/.kube/config \| base64` (for K8s deploy) |

3. Push to `main` or create a PR — the pipeline triggers automatically

---

## Quick Reference Card

| Action | Command |
|---|---|
| Deploy to dev | `kubectl apply -k k8s/overlays/dev/` |
| Deploy to prod | `kubectl apply -k k8s/overlays/prod/` |
| Deploy via script | `./scripts/deploy.sh dev` or `./scripts/deploy.sh prod v1.0.0` |
| Check pods | `kubectl -n airesume get pods` |
| Check logs | `kubectl -n airesume logs -f deployment/airesume-backend` |
| Port forward | `kubectl -n airesume port-forward svc/frontend 8080:80` |
| Scale up | `kubectl -n airesume scale deployment/airesume-backend --replicas=3` |
| Rollback | `kubectl -n airesume rollout undo deployment/airesume-backend` |
| Tear down | `kubectl delete -k k8s/overlays/dev/` |
| Change username | Edit `deploy.env` → update `DOCKER_USERNAME` and image paths |
