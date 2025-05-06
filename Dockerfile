# Use a specific Python version suitable for development
FROM python:3.10-slim

# Define build arguments for host and port with defaults (can be overridden)
ARG BACKEND_HOST=0.0.0.0
ARG BACKEND_PORT=5001
ARG FLASK_DEBUG=true

# Set environment variables for Flask development server
ENV PYTHONUNBUFFERED=1 \
    FLASK_APP=backend.app \
    FLASK_DEBUG=${FLASK_DEBUG} \
    BACKEND_HOST=${BACKEND_HOST} \
    BACKEND_PORT=${BACKEND_PORT}
    # Ensure GEMINI_API_KEY is passed via docker-compose env_file or environment
    # GEMINI_API_KEY=your_key_here # Example, better to use compose

WORKDIR /app

# Install system dependencies (keep if needed for runtime, e.g., libcups2)
# You might remove build-essential if not compiling anything at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcups2 \
#   libcups2-dev \ # Likely not needed unless installing pycups from source
#   build-essential \ # Likely not needed for runtime
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy only the requirements file first to leverage cache
COPY backend/requirements.txt ./backend/
# Install Python dependencies
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy the rest of the backend code (will be overwritten by mount in compose)
COPY backend/ ./backend/

# Expose the port Flask will run on
EXPOSE ${BACKEND_PORT}

# Set the command to run the Flask development server
# Gunicorn is typically for production; use Flask's built-in server for dev.
CMD ["flask", "run", "--host=0.0.0.0", "--port=${BACKEND_PORT}"]

# Optional: Development healthcheck (simpler than production)
# HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
#  CMD curl -f http://localhost:${BACKEND_PORT}/api/health || exit 1
