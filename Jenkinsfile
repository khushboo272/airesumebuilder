pipeline {
    agent any

    environment {
        APP_NAME = 'airesumebuilder'
        BACKEND_IMAGE = "airesumebuilder-backend:${BUILD_NUMBER}"
        FRONTEND_IMAGE = "airesumebuilder-frontend:${BUILD_NUMBER}"
        BACKEND_LATEST = "airesumebuilder-backend:latest"
        FRONTEND_LATEST = "airesumebuilder-frontend:latest"
        COMPOSE_PROJECT_NAME = "airesume_ci_${BUILD_NUMBER}"
    }

    options {
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
        disableConcurrentBuilds()
    }

    stages {
        stage('Checkout') {
            steps {
                echo 'Checking out source code...'
                checkout scm
            }
        }

        stage('Code Analysis & Quality Check') {
            parallel {
                stage('Backend Checks') {
                    steps {
                        dir('backend') {
                            echo 'Verifying backend configuration and dependencies...'
                            sh 'npm ci'
                        }
                    }
                }
                stage('Frontend Checks') {
                    steps {
                        dir('frontend') {
                            echo 'Linting and verifying frontend build capability...'
                            sh 'npm ci'
                            sh 'npm run lint || true'
                        }
                    }
                }
            }
        }

        stage('Build Docker Images') {
            steps {
                script {
                    echo "Building Backend Docker image: ${BACKEND_IMAGE}"
                    sh "docker build -t ${BACKEND_IMAGE} -t ${BACKEND_LATEST} ./backend"

                    echo "Building Frontend Docker image: ${FRONTEND_IMAGE}"
                    sh "docker build -t ${FRONTEND_IMAGE} -t ${FRONTEND_LATEST} ./frontend"
                }
            }
        }

        stage('Integration & Health Check') {
            steps {
                script {
                    echo 'Launching container stack with Docker Compose for health verification...'
                    sh "docker-compose -p ${COMPOSE_PROJECT_NAME} up -d"
                    
                    echo 'Waiting for services to become healthy...'
                    sleep 15

                    sh "docker ps -a --filter name=${COMPOSE_PROJECT_NAME}"
                    
                    // Verify API Health Endpoint
                    sh 'curl -f http://localhost:5000/api/health || exit 1'
                    echo 'Health check passed successfully!'
                }
            }
            post {
                always {
                    echo 'Cleaning up integration test container stack...'
                    sh "docker-compose -p ${COMPOSE_PROJECT_NAME} down -v"
                }
            }
        }

        stage('Deploy / Container Rolling Upgrade') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo 'Deploying updated containers to production environment...'
                    sh 'docker-compose up -d --build --remove-orphans'
                    echo 'Deployment completed successfully!'
                }
            }
        }
    }

    post {
        always {
            echo "Pipeline complete for ${env.JOB_NAME} build #${env.BUILD_NUMBER}."
            sh 'docker image prune -f || true'
        }
        success {
            echo 'SUCCESS: Build and deployment executed without errors.'
        }
        failure {
            echo 'FAILURE: Pipeline failed. Please check build output log.'
        }
    }
}
