
import os
import platform
import tempfile
import base64
import subprocess
import logging
import requests # For optional status callback
import sys

from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS

# --- Determine Base Directory and Web App Directory ---
IS_BUNDLED = getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS')

if IS_BUNDLED:
    # Running as a PyInstaller bundle
    # sys._MEIPASS is the temp dir created by PyInstaller
    # The executable's actual directory is sys.executable's dirname
    APP_BASE_DIR = os.path.dirname(sys.executable)
    WEB_APP_DIR = os.path.join(sys._MEIPASS, 'web') # Static files bundled into 'web' folder
    logging.info(f"Running in bundled mode. APP_BASE_DIR: {APP_BASE_DIR}, WEB_APP_DIR (bundled): {WEB_APP_DIR}")
else:
    # Development mode
    APP_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    # Assume Next.js output is in 'out' dir relative to the project root (one level up)
    WEB_APP_DIR = os.path.abspath(os.path.join(APP_BASE_DIR, '..', 'out'))
    logging.info(f"Running in development mode. APP_BASE_DIR: {APP_BASE_DIR}, WEB_APP_DIR: {WEB_APP_DIR}")


# --- Configuration ---
# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Initialize Flask app
# Serve static files from the determined WEB_APP_DIR/_next/static
# The root static folder is WEB_APP_DIR itself for index.html and other top-level assets
app = Flask(__name__, static_folder=WEB_APP_DIR)
CORS(app, resources={r"/api/*": {"origins": "*"}}) # Enable CORS for API routes
logging.info(f"Serving static files from: {app.static_folder}")
if not os.path.isdir(app.static_folder):
     logging.warning(f"Static folder {app.static_folder} does not exist. Web app UI might not load.")


# --- Platform Detection ---
SYSTEM_PLATFORM = platform.system().lower()
logging.info(f"Detected platform: {SYSTEM_PLATFORM}")

# --- Platform-Specific Imports and Functions ---
printer_lib = None
if SYSTEM_PLATFORM == "windows":
    try:
        import win32print
        import win32api
        printer_lib = "win32"
        logging.info("Using win32print for printing.")
    except ImportError:
        logging.error("pywin32 library not found. Please install it for Windows printing: pip install pywin32")
elif SYSTEM_PLATFORM in ["linux", "darwin"]: # darwin is macOS
    try:
        import cups
        printer_lib = "cups"
        logging.info("Using pycups for printing.")
    except ImportError:
        logging.warning("pycups library not found. Printing may not work. Install it if needed: pip install pycups")
else:
    logging.warning(f"Unsupported platform: {SYSTEM_PLATFORM}. Printing functionality will be limited.")

# --- Helper Functions ---

def get_printers_windows():
    """Returns a list of printer names available on Windows."""
    try:
        # PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS should cover most common printers
        printers = [printer[2] for printer in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
        logging.info(f"Found Windows printers: {printers}")
        return printers
    except Exception as e:
        logging.error(f"Error enumerating Windows printers: {e}", exc_info=True)
        return []

def get_printers_cups():
    """Returns a list of printer names available via CUPS (Linux/macOS)."""
    try:
        conn = cups.Connection()
        printers = list(conn.getPrinters().keys())
        logging.info(f"Found CUPS printers: {printers}")
        return printers
    except RuntimeError as e:
         # This often happens if the CUPS service isn't running
         logging.error(f"CUPS connection error (is CUPS service running?): {e}", exc_info=True)
         return []
    except Exception as e:
        logging.error(f"Error enumerating CUPS printers: {e}", exc_info=True)
        return []

def print_windows(printer_name, pdf_data, job_name="LabelVision Print"):
    """Sends PDF data to a specified printer on Windows using RAW data."""
    temp_pdf_path = None # Initialize in case of early error
    h_printer = None
    try:
        # Find the printer handle
        try:
            # Try opening the printer
            h_printer = win32print.OpenPrinter(printer_name)
            logging.info(f"Opened printer handle for '{printer_name}'")
        except Exception as e:
             # Use specific error codes if possible, otherwise generic message
             error_code = getattr(e, 'winerror', None)
             if error_code == 1801: # ERROR_INVALID_PRINTER_NAME
                 logging.error(f"Printer not found: '{printer_name}'. Ensure the name is exact.")
                 raise ValueError(f"Printer not found: {printer_name}") from e
             else:
                 logging.error(f"Could not open printer '{printer_name}' (Error code: {error_code}): {e}", exc_info=True)
                 raise ValueError(f"Printer not found or inaccessible: {printer_name}") from e

        # Start a print job using RAW data type
        # RAW tells the print spooler not to modify the job
        job_info = (job_name, None, "RAW")
        try:
            job_id = win32print.StartDocPrinter(h_printer, 1, job_info)
            logging.info(f"Started Windows print job {job_id} for '{printer_name}'")
        except Exception as e:
             logging.error(f"Failed to start print job for '{printer_name}': {e}", exc_info=True)
             raise IOError(f"Could not start print job on {printer_name}") from e

        try:
            # Send the PDF data directly to the printer
            win32print.StartPagePrinter(h_printer)
            bytes_written = win32print.WritePrinter(h_printer, pdf_data)
            logging.info(f"Wrote {bytes_written} bytes to printer '{printer_name}' for job {job_id}")
            if bytes_written != len(pdf_data):
                 logging.warning(f"Potential issue: bytes written ({bytes_written}) doesn't match PDF size ({len(pdf_data)}) for job {job_id}.")
            win32print.EndPagePrinter(h_printer)
            logging.info(f"Ended page for job {job_id}")

        except Exception as e:
            logging.error(f"Error writing data to printer '{printer_name}' (Job ID: {job_id}): {e}", exc_info=True)
            # Attempt to end the doc even if writing failed
            try: win32print.EndDocPrinter(h_printer)
            except: pass
            raise IOError(f"Failed to write data to printer {printer_name}") from e

        # End the print job
        win32print.EndDocPrinter(h_printer)
        logging.info(f"Successfully ended Windows print job {job_id}")

        return True # Indicates job was successfully sent

    except Exception as e:
        # Log the error already caught or a generic one if it's unexpected here
        logging.error(f"Error printing on Windows to '{printer_name}': {e}", exc_info=True)
        return False # Indicate failure

    finally:
        # Ensure the printer handle is closed
        if h_printer:
            try:
                win32print.ClosePrinter(h_printer)
                logging.info(f"Closed printer handle for '{printer_name}'")
            except Exception as close_e:
                logging.error(f"Error closing printer handle for '{printer_name}': {close_e}", exc_info=True)
        # Clean up temporary file if it was created (though RAW method avoids it)
        if temp_pdf_path and os.path.exists(temp_pdf_path):
            try:
                os.remove(temp_pdf_path)
                logging.info(f"Cleaned up temporary file: {temp_pdf_path}")
            except OSError as e:
                logging.warning(f"Could not remove temporary file {temp_pdf_path}: {e}")


def print_cups(printer_name, pdf_data, job_name="LabelVision Print"):
    """Sends PDF data to a specified printer via CUPS (Linux/macOS)."""
    temp_pdf_path = None # Initialize
    try:
        # Using a temporary file is generally the most reliable way for CUPS
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
            temp_pdf.write(pdf_data)
            temp_pdf_path = temp_pdf.name
        logging.info(f"Temporary PDF created at: {temp_pdf_path}")

        conn = cups.Connection()
        printers = conn.getPrinters()
        if printer_name not in printers:
            logging.error(f"CUPS Printer '{printer_name}' not found. Available: {list(printers.keys())}")
            raise ValueError(f"Printer not found: {printer_name}")

        logging.info(f"Sending job to CUPS printer: '{printer_name}'")
        # Options can be added here if needed, e.g., {'copies': '1', 'media': 'Custom.4x6in'}
        print_options = {}
        # Example: Detect common label sizes and try to set media option
        # This is highly dependent on the printer driver PPD file definitions
        # if "4x6" in job_name.lower() or "shipping" in job_name.lower():
        #     print_options['media'] = 'Custom.4x6in' # Or 'na_index-4x6_4x6in' etc.
        # elif "2.25x1.25" in job_name.lower():
        #      print_options['media'] = 'Custom.2.25x1.25in'

        job_id = conn.printFile(printer_name, temp_pdf_path, job_name, print_options)
        logging.info(f"CUPS Print job {job_id} submitted for '{printer_name}' with options: {print_options}")

        # Note: printFile queues the job. Success here doesn't mean the physical print worked.
        # Monitoring CUPS job status is more complex and requires polling conn.getJobAttributes(job_id)

        return True # Indicates job was successfully submitted to CUPS

    except Exception as e:
        logging.error(f"Error printing via CUPS to '{printer_name}': {e}", exc_info=True)
        return False # Indicate failure

    finally:
         # Clean up the temporary file
        if temp_pdf_path and os.path.exists(temp_pdf_path):
             try:
                 os.remove(temp_pdf_path)
                 logging.info(f"Cleaned up temporary file: {temp_pdf_path}")
             except OSError as e:
                 logging.warning(f"Could not remove temporary file {temp_pdf_path}: {e}")


# --- API Endpoints (Prefixed with /api) ---

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint for the print service API."""
    logging.info("API health check requested.")
    return jsonify({"status": "ok", "platform": SYSTEM_PLATFORM, "printer_lib": printer_lib or "none"})

@app.route('/api/printers', methods=['GET'])
def get_printers_api():
    """API endpoint to get a list of available printers."""
    logging.info("API printer list requested.")
    printers = []
    error_message = None

    if printer_lib == "win32":
        printers = get_printers_windows()
    elif printer_lib == "cups":
        printers = get_printers_cups()
    else:
        error_message = "Printing library not available or platform not supported."
        logging.warning(error_message)
        return jsonify({"detail": error_message}), 500

    if printers is None: # Indicates an internal failure in the helper function
         error_message = f"Failed to retrieve printers on {SYSTEM_PLATFORM}."
         return jsonify({"detail": error_message}), 500

    return jsonify(printers)

@app.route('/api/print', methods=['POST'])
def print_label_api():
    """API endpoint to receive PDF data (Base64) and printer name, then print."""
    logging.info("Received /api/print request.")
    if not request.is_json:
        logging.error("API request is not JSON.")
        return jsonify({"detail": "Request must be JSON"}), 400

    data = request.get_json()
    pdf_b64 = data.get('pdfData')
    printer_name = data.get('printerName')
    # Extract job name from summary if possible, or use a default
    label_summary = data.get('labelSummary', 'Label') # Assuming frontend sends summary
    job_name = f"LabelVision - {label_summary[:30]}" # Limit job name length


    if not pdf_b64 or not printer_name:
        logging.error(f"API Missing required fields. pdfData provided: {bool(pdf_b64)}, printerName provided: {bool(printer_name)}")
        missing = []
        if not pdf_b64: missing.append("'pdfData'")
        if not printer_name: missing.append("'printerName'")
        return jsonify({"detail": f"Missing required field(s): {', '.join(missing)}"}), 400

    try:
        pdf_bytes = base64.b64decode(pdf_b64)
        logging.info(f"API Successfully decoded {len(pdf_bytes)} bytes of PDF data for job '{job_name}'.")
    except (TypeError, base64.binascii.Error) as e:
        logging.error(f"API Invalid Base64 PDF data received: {e}", exc_info=True)
        return jsonify({"detail": "Invalid Base64 encoding for pdfData"}), 400
    except Exception as e:
        logging.error(f"API Unexpected error during Base64 decoding: {e}", exc_info=True)
        return jsonify({"detail": "Error decoding PDF data"}), 500

    print_successful = False
    error_message = "Printing library not available or platform not supported."

    try:
        if printer_lib == "win32":
            logging.info(f"API Attempting to print via win32print to '{printer_name}'...")
            print_successful = print_windows(printer_name, pdf_bytes, job_name=job_name)
            if not print_successful: error_message = f"win32print job submission failed for {printer_name}."

        elif printer_lib == "cups":
            logging.info(f"API Attempting to print via pycups to '{printer_name}'...")
            print_successful = print_cups(printer_name, pdf_bytes, job_name=job_name)
            if not print_successful: error_message = f"CUPS job submission failed for {printer_name}."

        else:
             logging.warning(f"API No printing library available for {SYSTEM_PLATFORM}. Cannot print.")
             # Keep print_successful as False, error_message is already set

    except ValueError as ve: # Specific error like printer not found
        logging.error(f"API Printing configuration error: {ve}", exc_info=False)
        error_message = str(ve)
        return jsonify({"detail": error_message}), 404 # Not Found or Bad Request might be appropriate

    except IOError as ioe: # Errors during the actual print IO
         logging.error(f"API Printing IO error: {ioe}", exc_info=True)
         error_message = f"Error during printing process: {ioe}"
         return jsonify({"detail": error_message}), 500 # Internal server error

    except Exception as e: # Catch unexpected errors during printing attempt
        logging.error(f"API Unexpected error during printing process: {e}", exc_info=True)
        error_message = f"An unexpected error occurred during printing: {e}"
        return jsonify({"detail": error_message}), 500

    # --- Final Response ---
    if print_successful:
        logging.info(f"API Print job '{job_name}' successfully sent to '{printer_name}'.")
        return jsonify({"message": f"Print job sent successfully to {printer_name}"}), 200
    else:
        # Log the error_message determined during the print attempt
        logging.error(f"API Print job failed for '{printer_name}'. Reason: {error_message}")
        # Determine appropriate status code based on the error
        status_code = 500 if "library not available" in error_message else 400 # Use 500 for setup issues, 400/500 for runtime print errors
        return jsonify({"detail": error_message}), status_code


# --- Static File Serving & Catch-all for Client-Side Routing ---

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_webapp(path):
    """
    Serves the main Next.js index.html for client-side routing,
    or specific static assets if they exist.
    """
    # Construct the full path relative to the web app directory
    full_path = os.path.join(WEB_APP_DIR, path)

    # Check if the requested path points to an existing file
    if path and os.path.exists(full_path) and os.path.isfile(full_path):
        # Serve the specific static file (e.g., image, css, js chunk)
        logging.debug(f"Serving static file: {path}")
        return send_from_directory(WEB_APP_DIR, path)
    else:
        # Serve the main index.html for the root or any non-file path
        # This allows Next.js client-side router to handle the route
        index_path = os.path.join(WEB_APP_DIR, 'index.html')
        if not os.path.exists(index_path):
            logging.error(f"Web app index.html not found at {index_path}. Build the Next.js app first ('npm run build').")
            return jsonify({"error": "Web application not found. Please build the Next.js frontend."}), 404
        logging.debug(f"Serving index.html for path: {path or '/'}")
        return send_file(index_path)


# --- Main Execution ---
if __name__ == '__main__':
    # Use environment variable for port, default to 5001
    port = int(os.environ.get('FLASK_RUN_PORT', 5001))
    # Use environment variable for host, default to 127.0.0.1 (localhost)
    # Set to '0.0.0.0' to be accessible from the network (e.g., within Docker)
    host = os.environ.get('FLASK_RUN_HOST', '127.0.0.1')
    # Use environment variable for debug mode, default to False
    debug_mode = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'

    logging.info(f"Starting Flask server on {host}:{port} (Debug: {debug_mode})...")
    logging.info(f"Web application static root directory: {WEB_APP_DIR}")

    if not os.path.exists(WEB_APP_DIR) or not os.path.exists(os.path.join(WEB_APP_DIR, 'index.html')):
         logging.warning("---")
         logging.warning(f"Web app directory ('{WEB_APP_DIR}') or index.html not found.")
         logging.warning("Ensure you have run 'npm run build' in the Next.js project root.")
         logging.warning("API endpoints will work, but the web interface will not load.")
         logging.warning("---")

    # Run the Flask app
    # Use debug=debug_mode for development reloading
    app.run(host=host, port=port, debug=debug_mode)
```
  </change>
  <change>
     <file>docs/api/python-desktop-app.md</file>
     <description>Update Python API documentation to reflect API endpoint changes (prefix /api) and clarify serving mechanism.</description>
     <content><![CDATA[# API Documentation: Python Desktop Print Service (Flask Backend)

This document describes the API endpoints exposed by the Python Flask application designed to act as a print service and **serve the static Label Vision Next.js web application**.

## Base URL

The Python application runs a local web server. When running locally or in Docker, it typically listens on:

`http://localhost:5001`

(This port can be configured via the `FLASK_RUN_PORT` environment variable).

## Serving the Web Application

*   The Flask application is configured to serve the static files generated by the Next.js build (`npm run build`, which outputs to the `out/` directory).
*   It serves `out/index.html` for the root path (`/`) and any other non-API path, allowing the Next.js client-side router to handle navigation.
*   Static assets like CSS, JavaScript, and images located within `out/_next/static/` are served directly by Flask under the `/` path.

## API Endpoints (Prefixed with `/api`)

All backend API endpoints are prefixed with `/api` to distinguish them from the frontend routes.

### 1. Health Check

*   **Endpoint:** `/api/health`
*   **Method:** `GET`
*   **Purpose:** Allows the Next.js frontend (running in the browser, served by this Flask app) to check if the Python print service *backend* is running and reachable.
*   **Request Body:** None
*   **Responses:**
    *   **`200 OK`**:
        *   **Content:** `application/json`
        *   **Body:** `{ "status": "ok", "platform": "windows|linux|darwin", "printer_lib": "win32|cups|none" }`
        *   **Description:** The service is running and healthy. Includes basic platform info.
    *   **(Implicit) Connection Error:** If the Next.js app cannot connect to this endpoint (e.g., `fetch` fails), it indicates a server issue or network problem.

### 2. Get Available Printers

*   **Endpoint:** `/api/printers`
*   **Method:** `GET`
*   **Purpose:** Retrieves a list of printer names known to the system where the Python application is running.
*   **Request Body:** None
*   **Responses:**
    *   **`200 OK`**:
        *   **Content:** `application/json`
        *   **Body:** `["Printer Name 1", "Microsoft Print to PDF", "My Label Printer ZT410"]` (Example)
        *   **Description:** Successfully retrieved the list of available printer names as an array of strings. The list might be empty if no printers are found or accessible.
    *   **`500 Internal Server Error`**:
        *   **Content:** `application/json`
        *   **Body:** `{ "detail": "Error message describing the failure" }`
        *   **Description:** An error occurred on the Python server while trying to list printers (e.g., issues with `win32print` or `pycups`, CUPS service down).

### 3. Print Label

*   **Endpoint:** `/api/print`
*   **Method:** `POST`
*   **Purpose:** Receives label data (as a PDF) and sends it to the specified printer.
*   **Request Body:**
    *   **Content-Type:** `application/json`
    *   **Schema:**
        ```typescript
        {
          pdfData: string; // Required: The generated PDF content, encoded as a Base64 string.
          printerName: string; // Required: The exact name of the target printer (must match one from the /api/printers list).
          labelSummary?: string; // Optional: A short summary for the print job name.
          // Optional: Add other print job options here if needed in the future
        }
        ```
    *   **Example:**
        ```json
        {
          "pdfData": "JVBERi0xLjcKJeLjz9MKMSAwIG9iago8PCAvVHlwZSAvQ2F0YW...", // Truncated Base64 PDF data
          "printerName": "My Label Printer ZT410",
          "labelSummary": "Sample Items"
        }
        ```
*   **Responses:**
    *   **`200 OK`**:
        *   **Content:** `application/json`
        *   **Body:** `{ "message": "Print job sent successfully to [Printer Name]" }`
        *   **Description:** The print job was successfully submitted to the OS printing system for the specified printer. **Note:** This usually means the job was *queued*, not necessarily that it physically printed without error.
    *   **`400 Bad Request`**:
        *   **Content:** `application/json`
        *   **Body:** `{ "detail": "Invalid payload: Missing required field 'pdfData'" }` or `{ "detail": "Invalid Base64 encoding for pdfData" }` or similar validation error.
        *   **Description:** The request body was malformed or missing required fields.
    *   **`404 Not Found`**:
        *   **Content:** `application/json`
        *   **Body:** `{ "detail": "Printer not found: [Printer Name]" }`
        *   **Description:** The specified `printerName` does not match any printer known to the system or accessible by the service.
    *   **`500 Internal Server Error`**:
        *   **Content:** `application/json`
        *   **Body:** `{ "detail": "Error message describing the printing failure" }`
        *   **Description:** An error occurred during the printing process on the server (e.g., communication error with the printer spooler, invalid PDF data *after* decoding, permission issues).

### 4. Notify Status (Optional - Python -> Separate Service)

*   **Endpoint:** `http://localhost:9002/api/print-status` (Example: Separate Next.js instance if *not* serving frontend from Flask)
*   **Method:** `POST`
*   **Purpose:** Allows the Python application to send the final status (success/failure) of a print job back to *another* application (e.g., if Next.js were running independently). **This is generally NOT used when Flask serves the Next.js frontend**, as feedback mechanisms would typically be handled differently (e.g., polling, WebSockets if implemented).
*   **Request Body:** (See `docs/api/print-status.md` for the schema expected by the *other* Next.js app)
    ```json
    {
      "jobId": "optional-job-id", // Optional
      "status": "success", // or "error"
      "message": "Printed successfully.", // Optional
      "printerName": "My Label Printer ZT410" // Optional
    }
    ```

## Security Considerations

*   **CORS:** CORS is handled by Flask (`Flask-Cors`) for the `/api/*` routes. Since the frontend is served from the same origin (`http://localhost:5001`), CORS is generally not an issue for frontend-backend communication within this setup.
*   **Network Access:** The Flask application listens on a specific host and port (e.g., `127.0.0.1:5001` locally, `0.0.0.0:5001` in Docker). Ensure firewalls allow access to this port if accessing from other machines (relevant for Docker deployments).
*   **Authentication:** No authentication is implemented by default. For production or shared environments, consider adding API key checks or other authentication mechanisms to the `/api/*` endpoints.
*   **File System Access:** The application needs read access to the Next.js build output (`out/`) and potentially write access to temporary directories (`tempfile`). Ensure appropriate permissions.
*   **Printing Permissions:** The user account running the Python Flask process needs permission to access and print to the selected system printers. This can be a consideration in restricted environments or when running as a different user/service.
