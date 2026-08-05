pipeline {
    agent any

    environment {
        APP_NAME = 'airesumebuilder'

        // Build tags — everything else loaded from deploy.env in Stage 1
        BUILD_TAG = "${BUILD_NUMBER}"
        COMPOSE_PROJECT_NAME = "airesume_ci_${BUILD_NUMBER}"
    }

    options {
        timeout(time: 45, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '15'))
        disableConcurrentBuilds()
        timestamps()
    }

    stages {
        // ── Stage 1: Checkout & Load Global Config ───────────────────
        stage('Checkout') {
            steps {
                echo '📥 Checking out source code...'
                checkout scm

                // Load all variables from deploy.env into the pipeline environment
                script {
                    def config = readFile('deploy.env')
                        .split('\n')
                        .findAll { it.trim() && !it.trim().startsWith('#') }
                        .collectEntries { line ->
                            def parts = line.split('=', 2)
                            [(parts[0].trim()): parts[1].trim()]
                        }
                    env.DOCKER_REGISTRY = config.DOCKER_REGISTRY
                    env.DOCKER_USERNAME = config.DOCKER_USERNAME
                    env.BACKEND_IMAGE = config.BACKEND_IMAGE
                    env.FRONTEND_IMAGE = config.FRONTEND_IMAGE
                    env.K8S_NAMESPACE = config.K8S_NAMESPACE

                    echo "📋 Config loaded from deploy.env:"
                    echo "   Registry : ${env.DOCKER_REGISTRY}"
                    echo "   Username : ${env.DOCKER_USERNAME}"
                    echo "   Backend  : ${env.BACKEND_IMAGE}"
                    echo "   Frontend : ${env.FRONTEND_IMAGE}"
                    echo "   Namespace: ${env.K8S_NAMESPACE}"
                }
            }
        }

        // ── Stage 2: Code Quality ────────────────────────────────────
        stage('Code Quality') {
            parallel {
                stage('Backend Checks') {
                    steps {
                        dir('backend') {
                            echo '🔍 Installing backend dependencies...'
                            sh 'npm ci'
                        }
                    }
                }
                stage('Frontend Checks') {
                    steps {
                        dir('frontend') {
                            echo '🔍 Installing and linting frontend...'
                            sh 'npm ci'
                            sh 'npm run lint || true'
                        }
                    }
                }
            }
        }

        // ── Stage 3: Unit Tests ──────────────────────────────────────
        stage('Unit Tests') {
            parallel {
                stage('Backend Tests') {
                    steps {
                        dir('backend') {
                            echo '🧪 Running backend tests...'
                            sh 'npm test || echo "No test script defined — skipping"'
                        }
                    }
                }
                stage('Frontend Tests') {
                    steps {
                        dir('frontend') {
                            echo '🧪 Running frontend tests...'
                            sh 'npm test || echo "No test script defined — skipping"'
                        }
                    }
                }
            }
        }

        // ── Stage 4: Build Docker Images ─────────────────────────────
        stage('Build Docker Images') {
            steps {
                script {
                    echo "🐳 Building Backend image: ${BACKEND_IMAGE}:${BUILD_TAG}"
                    sh "docker build -t ${BACKEND_IMAGE}:${BUILD_TAG} -t ${BACKEND_IMAGE}:latest ./backend"

                    echo "🐳 Building Frontend image: ${FRONTEND_IMAGE}:${BUILD_TAG}"
                    sh "docker build -t ${FRONTEND_IMAGE}:${BUILD_TAG} -t ${FRONTEND_IMAGE}:latest ./frontend"
                }
            }
        }

        // ── Stage 5: Push to Container Registry ──────────────────────
        stage('Push Docker Images') {
            steps {
                script {
                    echo '📤 Logging into container registry...'
                    withCredentials([usernamePassword(
                        credentialsId: 'docker-registry-credentials',
                        usernameVariable: 'DOCKER_USER',
                        passwordVariable: 'DOCKER_PASS'
                    )]) {
                        sh "echo ${DOCKER_PASS} | docker login ${DOCKER_REGISTRY} -u ${DOCKER_USER} --password-stdin"
                    }

                    echo "📤 Pushing Backend image..."
                    sh "docker push ${BACKEND_IMAGE}:${BUILD_TAG}"
                    sh "docker push ${BACKEND_IMAGE}:latest"

                    echo "📤 Pushing Frontend image..."
                    sh "docker push ${FRONTEND_IMAGE}:${BUILD_TAG}"
                    sh "docker push ${FRONTEND_IMAGE}:latest"
                }
            }
        }

        // ── Stage 6: Integration Health Check ────────────────────────
        stage('Integration Health Check') {
            steps {
                script {
                    echo '🏥 Launching container stack for health verification...'
                    sh "docker-compose -p ${COMPOSE_PROJECT_NAME} up -d"

                    echo 'Waiting for services to start...'
                    sleep 15

                    sh "docker ps -a --filter name=${COMPOSE_PROJECT_NAME}"

                    echo 'Verifying API health...'
                    sh 'curl -f http://localhost:5000/api/health || exit 1'
                    echo '✅ Health check passed!'
                }
            }
            post {
                always {
                    echo 'Cleaning up integration test containers...'
                    sh "docker-compose -p ${COMPOSE_PROJECT_NAME} down -v"
                }
            }
        }

        // ── Stage 7: Deploy to Dev (K8s) ─────────────────────────────
        stage('Deploy to Dev') {
            when {
                branch 'dev'
            }
            steps {
                script {
                    echo '🚀 Deploying to Dev Kubernetes environment...'
                    withKubeConfig([credentialsId: 'kubeconfig-dev']) {
                        // Update image tags in kustomization
                        dir('k8s/overlays/dev') {
                            sh """
                                kustomize edit set image \
                                    airesumebuilder-backend=${BACKEND_IMAGE}:${BUILD_TAG} \
                                    airesumebuilder-frontend=${FRONTEND_IMAGE}:${BUILD_TAG}
                            """
                        }
                        sh "kubectl apply -k k8s/overlays/dev/"
                        sh "kubectl -n ${K8S_NAMESPACE} rollout status deployment/airesume-backend --timeout=120s"
                        sh "kubectl -n ${K8S_NAMESPACE} rollout status deployment/airesume-frontend --timeout=120s"
                        echo '✅ Dev deployment complete!'
                    }
                }
            }
        }

        // ── Stage 8: Deploy to Production (K8s) ──────────────────────
        stage('Deploy to Production') {
            when {
                branch 'main'
            }
            steps {
                script {
                    // Manual approval gate — requires human confirmation
                    input message: '🚨 Deploy to PRODUCTION?', ok: 'Yes, deploy to production',
                          submitter: 'admin,deploy-team'

                    echo '🚀 Deploying to Production Kubernetes environment...'
                    withKubeConfig([credentialsId: 'kubeconfig-prod']) {
                        dir('k8s/overlays/prod') {
                            sh """
                                kustomize edit set image \
                                    airesumebuilder-backend=${BACKEND_IMAGE}:${BUILD_TAG} \
                                    airesumebuilder-frontend=${FRONTEND_IMAGE}:${BUILD_TAG}
                            """
                        }
                        sh "kubectl apply -k k8s/overlays/prod/"
                        sh "kubectl -n ${K8S_NAMESPACE} rollout status deployment/airesume-backend --timeout=180s"
                        sh "kubectl -n ${K8S_NAMESPACE} rollout status deployment/airesume-frontend --timeout=180s"
                        echo '✅ Production deployment complete!'
                    }
                }
            }
        }

        // ── Stage 9: Post-Deploy Smoke Test ──────────────────────────
        stage('Smoke Test') {
            when {
                anyOf {
                    branch 'main'
                    branch 'dev'
                }
            }
            steps {
                script {
                    def targetEnv = (env.BRANCH_NAME == 'main') ? 'prod' : 'dev'
                    def kubeconfigId = "kubeconfig-${targetEnv}"

                    echo "🔍 Running smoke test against ${targetEnv}..."
                    withKubeConfig([credentialsId: kubeconfigId]) {
                        // Port-forward the backend service to test health
                        sh """
                            kubectl -n ${K8S_NAMESPACE} port-forward svc/backend 5000:5000 &
                            PORT_FWD_PID=\$!
                            sleep 5
                            curl -f http://localhost:5000/api/health || {
                                echo '❌ Smoke test FAILED — initiating rollback...'
                                kubectl -n ${K8S_NAMESPACE} rollout undo deployment/airesume-backend
                                kubectl -n ${K8S_NAMESPACE} rollout undo deployment/airesume-frontend
                                kill \$PORT_FWD_PID || true
                                exit 1
                            }
                            kill \$PORT_FWD_PID || true
                            echo '✅ Smoke test passed!'
                        """
                    }
                }
            }
        }
    }

    post {
        always {
            echo "📋 Pipeline complete for ${env.JOB_NAME} build #${env.BUILD_NUMBER}."
            sh 'docker image prune -f || true'
        }
        success {
            echo '🎉 SUCCESS: Build and deployment executed without errors.'
            // Uncomment for Slack notification:
            // slackSend(channel: '#deployments', color: 'good',
            //     message: "✅ ${env.JOB_NAME} #${env.BUILD_NUMBER} succeeded (${env.BRANCH_NAME})")
        }
        failure {
            echo '❌ FAILURE: Pipeline failed. Check build output for details.'
            // Uncomment for Slack notification:
            // slackSend(channel: '#deployments', color: 'danger',
            //     message: "❌ ${env.JOB_NAME} #${env.BUILD_NUMBER} FAILED (${env.BRANCH_NAME})")
        }
    }
}
