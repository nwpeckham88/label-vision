# Use an official Python runtime as a parent image
# Using slim-buster for a smaller image size. Choose a Python version compatible with your dependencies.
FROM python:3.11-slim-buster

# Set the working directory in the container
WORKDIR /app

# Install system dependencies that might be needed for printing libraries
# cups-client is needed for pycups
# Other dependencies might be required depending on the exact setup and printer drivers
RUN apt-get update && apt-get install -y --no-install-recommends \
    cups-client \
    # Add any other system dependencies here if needed (e.g., for specific printer drivers)
    && rm -rf /var/lib/apt/lists/*

# Copy the requirements file into the container at /app
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
# --no-cache-dir: Disables the cache to keep image size down
# --default-timeout=100: Increase timeout for pip install if network is slow
# Note: pywin32 will fail to install on Linux/macOS, but the requirements.txt
# uses environment markers to only attempt installing it on Windows.
# pycups will be installed on Linux/macOS.
RUN pip install --no-cache-dir --default-timeout=100 -r requirements.txt

# Copy the rest of the application code into the container at /app
COPY app.py .

# Make port 5001 available to the world outside this container
EXPOSE 5001

# Define environment variables (optional, can be set at runtime)
# Example: Set the default port Flask runs on
ENV PORT=5001
# Example: Set the URL for the Next.js status callback (if used)
# ENV NEXTJS_STATUS_URL=http://host.docker.internal:9002/api/print-status

# Set the default command to run when the container starts
# Use 'flask run' which is simpler for development/testing within Docker
# Use 'gunicorn' or similar for production deployments
# The host '0.0.0.0' is important inside Docker to accept connections from outside the container
CMD ["flask", "run", "--host=0.0.0.0", "--port=5001"]

# --- Notes on Printing from Docker ---
# Printing directly from a standard Docker container to host printers is complex
# because the container is isolated from the host's hardware and services (like CUPS or Windows Spooler).
#
# Possible approaches (requiring host configuration):
# 1. CUPS (Linux/macOS): Mount the CUPS socket into the container (`-v /var/run/cups/cups.sock:/var/run/cups/cups.sock`).
#    The container needs `cups-client` installed (added above).
# 2. Windows: This is significantly harder. Network printing or specific Docker volume mapping might be needed.
#
# This Dockerfile sets up the Python environment but DOES NOT guarantee printing functionality
# without additional Docker runtime configuration and host setup.
# The app.py includes checks and will log warnings/errors if printing libraries fail.
