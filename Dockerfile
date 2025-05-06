# Stage 1: Build the Next.js frontend
FROM node:20-slim AS frontend-builder

WORKDIR /app

# Copy frontend package manifests
COPY package.json ./
COPY package-lock.json ./

# Install frontend dependencies
RUN npm install

# Copy the rest of the frontend source code
COPY . .

# Build the Next.js app and export static files
# Ensure the build script in package.json includes `next export`
RUN npm run build

# ---

# Stage 2: Setup the Python environment and run the Flask app
FROM python:3.10-slim

# Define build arguments for host and port with defaults
ARG BACKEND_HOST=0.0.0.0
ARG BACKEND_PORT=5001

# Set environment variables from build arguments (allows override at runtime)
ENV BACKEND_HOST=${BACKEND_HOST}
ENV BACKEND_PORT=${BACKEND_PORT}
# Also expose the port for documentation/clarity (doesn't affect runtime)
EXPOSE ${BACKEND_PORT}

WORKDIR /app

# Install system dependencies required by some printing libraries (example for Debian/Ubuntu)
# Adjust as needed for your specific base image or OS requirements
# pycups needs libcups2-dev and build-essential for compilation
# pywin32 is Windows-only and usually pre-compiled wheels are available
# google-generativeai might need specific certs if behind strict proxies, but usually fine.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcups2 \
    libcups2-dev \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements first to leverage Docker cache
COPY python-print-service/requirements.txt ./python-print-service/
# Install Python dependencies, including the new google-generativeai
RUN pip install --no-cache-dir -r python-print-service/requirements.txt

# Copy the Python backend code
COPY python-print-service/app.py ./python-print-service/

# Copy the built static frontend files from the builder stage
COPY --from=frontend-builder /app/out ./out

# Expose the port the Flask app runs on (using the ENV variable)
# Note: EXPOSE doesn't publish the port, just documents it. Publishing happens in docker run/compose.
# EXPOSE ${BACKEND_PORT} # Already defined above ENV block

# Set the command to run the Flask application using Gunicorn with ENV variables
# Use environment variables for binding host and port
# Use shell form CMD to allow variable substitution
CMD gunicorn --bind "${BACKEND_HOST}:${BACKEND_PORT}" python-print-service.app:app

# Add healthcheck (optional but good practice)
# Use the ENV variable for the port in the healthcheck URL
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${BACKEND_PORT}/api/health || exit 1
