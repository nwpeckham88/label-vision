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

WORKDIR /app

# Install system dependencies required by some printing libraries (example for Debian/Ubuntu)
# Adjust as needed for your specific base image or OS requirements
# pycups needs libcups2-dev and build-essential for compilation
# pywin32 is Windows-only and usually pre-compiled wheels are available
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcups2 \
    libcups2-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements first to leverage Docker cache
COPY python-print-service/requirements.txt ./python-print-service/
RUN pip install --no-cache-dir -r python-print-service/requirements.txt

# Copy the Python backend code
COPY python-print-service/app.py ./python-print-service/

# Copy the built static frontend files from the builder stage
COPY --from=frontend-builder /app/out ./out

# Expose the port the Flask app runs on
EXPOSE 5001

# Set the command to run the Flask application
# Use gunicorn or similar for production, but Flask dev server is fine for local/simpler deployments
# CMD ["python", "python-print-service/app.py"]
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "python-print-service.app:app"]

# Add healthcheck (optional but good practice)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5001/api/health || exit 1
