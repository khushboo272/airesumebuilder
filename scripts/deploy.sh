set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# ── Load global config ───────────────────────────────────────
if [ ! -f "$PROJECT_ROOT/deploy.env" ]; then
    echo "❌ deploy.env not found at project root."
    exit 1
fi
# shellcheck source=../deploy.env
source "$PROJECT_ROOT/deploy.env"

# ── Parse arguments ──────────────────────────────────────────
ENVIRONMENT="${1:-}"
IMAGE_TAG="${2:-latest}"

if [ -z "$ENVIRONMENT" ]; then
    echo "Usage: $0 <dev|prod> [image-tag]"
    echo ""
    echo "Examples:"
    echo "  $0 dev                # Deploy latest to dev"
    echo "  $0 prod v1.2.3        # Deploy v1.2.3 to production"
    exit 1
fi

OVERLAY_DIR="$PROJECT_ROOT/k8s/overlays/$ENVIRONMENT"

if [ ! -d "$OVERLAY_DIR" ]; then
    echo "❌ Overlay directory not found: $OVERLAY_DIR"
    echo "   Available: dev, prod"
    exit 1
fi

echo "============================================================"
echo "🚀 Deploying AI Resume Builder"
echo "   Environment : $ENVIRONMENT"
echo "   Registry    : $DOCKER_REGISTRY/$DOCKER_USERNAME"
echo "   Backend     : $BACKEND_IMAGE:$IMAGE_TAG"
echo "   Frontend    : $FRONTEND_IMAGE:$IMAGE_TAG"
echo "   Namespace   : $K8S_NAMESPACE"
echo "============================================================"

# ── Update image tags via Kustomize ──────────────────────────
cd "$OVERLAY_DIR"
kustomize edit set image \
    "airesumebuilder-backend=$BACKEND_IMAGE:$IMAGE_TAG" \
    "airesumebuilder-frontend=$FRONTEND_IMAGE:$IMAGE_TAG"

# ── Apply manifests ──────────────────────────────────────────
echo ""
echo "📦 Applying Kubernetes manifests..."
kubectl apply -k "$OVERLAY_DIR/"

# ── Wait for rollout ─────────────────────────────────────────
echo ""
echo "⏳ Waiting for rollout to complete..."
kubectl -n "$K8S_NAMESPACE" rollout status deployment/airesume-backend --timeout=180s
kubectl -n "$K8S_NAMESPACE" rollout status deployment/airesume-frontend --timeout=180s

# ── Verify ───────────────────────────────────────────────────
echo ""
echo "✅ Deployment complete! Pod status:"
kubectl -n "$K8S_NAMESPACE" get pods

echo ""
echo "🌐 Services:"
kubectl -n "$K8S_NAMESPACE" get svc

echo ""
echo "🔗 Ingress:"
kubectl -n "$K8S_NAMESPACE" get ingress
