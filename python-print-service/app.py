
import os
import platform
import tempfile
import base64
import subprocess
import logging
import requests # For optional status callback

from flask import Flask, request, jsonify
from flask_cors import CORS

# --- Configuration ---
# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Initialize Flask app
app = Flask(__name__)
CORS(app) # Enable CORS for all routes, allowing requests from the Next.js app's origin

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
         logging.error(f"CUPS connection error (is CUPS running?): {e}", exc_info=True)
         return []
    except Exception as e:
        logging.error(f"Error enumerating CUPS printers: {e}", exc_info=True)
        return []

def print_windows(printer_name, pdf_data, job_name="LabelVision Print"):
    """Sends PDF data to a specified printer on Windows."""
    try:
        # pywin32 printing often works best by printing a file directly
        # Create a temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
            temp_pdf.write(pdf_data)
            temp_pdf_path = temp_pdf.name
        logging.info(f"Temporary PDF created at: {temp_pdf_path}")

        # Find the printer handle
        try:
            h_printer = win32print.OpenPrinter(printer_name)
        except Exception as e:
             logging.error(f"Could not open printer '{printer_name}': {e}. Ensure the printer name is exact.", exc_info=True)
             # Clean up temp file before raising
             try:
                 os.remove(temp_pdf_path)
                 logging.info(f"Cleaned up temporary file: {temp_pdf_path}")
             except OSError as remove_err:
                 logging.warning(f"Could not remove temporary file {temp_pdf_path}: {remove_err}")
             raise ValueError(f"Printer not found or inaccessible: {printer_name}") from e

        try:
            # Start a print job
            job_info = (job_name, None, "RAW") # RAW mode is often best for pre-formatted data like PDF
            job_id = win32print.StartDocPrinter(h_printer, 1, job_info)
            logging.info(f"Started Windows print job {job_id} for '{printer_name}'")

            # Send the file path to the printer - more reliable than sending bytes for some drivers
            # Using shell execute to print the file with the default PDF viewer associated action
            # This relies on having a PDF reader installed and associated.
            win32api.ShellExecute(
                0,                  # Handle to the parent window (0 for desktop)
                "printto",          # Verb: printto
                temp_pdf_path,      # File path
                f'"{printer_name}"', # Printer name (quoted)
                ".",                # Default directory
                0                   # Show command (0 for hide)
            )
            logging.info(f"Sent print command for {temp_pdf_path} to '{printer_name}' via ShellExecute.")

            # For RAW data sending (alternative, might not work with all printers/PDFs):
            # win32print.StartPagePrinter(h_printer)
            # win32print.WritePrinter(h_printer, pdf_data)
            # win32print.EndPagePrinter(h_printer)

            win32print.EndDocPrinter(h_printer)
            logging.info(f"Ended Windows print job {job_id}")

        finally:
            win32print.ClosePrinter(h_printer)
            logging.info(f"Closed printer handle for '{printer_name}'")
             # Clean up the temporary file
            try:
                os.remove(temp_pdf_path)
                logging.info(f"Cleaned up temporary file: {temp_pdf_path}")
            except OSError as e:
                logging.warning(f"Could not remove temporary file {temp_pdf_path}: {e}")

        return True # Indicates job was sent

    except Exception as e:
        logging.error(f"Error printing on Windows to '{printer_name}': {e}", exc_info=True)
        return False # Indicate failure

def print_cups(printer_name, pdf_data, job_name="LabelVision Print"):
    """Sends PDF data to a specified printer via CUPS (Linux/macOS)."""
    try:
        # CUPS can often print directly from data or a temp file
        # Using a temporary file is generally safer
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
            temp_pdf.write(pdf_data)
            temp_pdf_path = temp_pdf.name
        logging.info(f"Temporary PDF created at: {temp_pdf_path}")

        conn = cups.Connection()
        printers = conn.getPrinters()
        if printer_name not in printers:
            logging.error(f"CUPS Printer '{printer_name}' not found. Available: {list(printers.keys())}")
            # Clean up temp file before raising
            try:
                 os.remove(temp_pdf_path)
                 logging.info(f"Cleaned up temporary file: {temp_pdf_path}")
            except OSError as remove_err:
                 logging.warning(f"Could not remove temporary file {temp_pdf_path}: {remove_err}")
            raise ValueError(f"Printer not found: {printer_name}")

        logging.info(f"Sending job to CUPS printer: '{printer_name}'")
        # Options can be added here if needed, e.g., {'copies': '1'}
        print_options = {}
        job_id = conn.printFile(printer_name, temp_pdf_path, job_name, print_options)
        logging.info(f"CUPS Print job {job_id} submitted for '{printer_name}'")

        # Clean up the temporary file *after* submitting the job
        try:
            os.remove(temp_pdf_path)
            logging.info(f"Cleaned up temporary file: {temp_pdf_path}")
        except OSError as e:
            logging.warning(f"Could not remove temporary file {temp_pdf_path}: {e}")

        return True # Indicates job was sent

    except Exception as e:
        logging.error(f"Error printing via CUPS to '{printer_name}': {e}", exc_info=True)
        # Attempt cleanup even on error
        if 'temp_pdf_path' in locals() and os.path.exists(temp_pdf_path):
             try:
                 os.remove(temp_pdf_path)
                 logging.info(f"Cleaned up temporary file after error: {temp_pdf_path}")
             except OSError as remove_err:
                 logging.warning(f"Could not remove temporary file {temp_pdf_path} after error: {remove_err}")
        return False # Indicate failure


# --- Optional: Function to notify Next.js ---
def notify_nextjs(status, message=None, job_id=None, printer_name=None):
    """Sends a status update back to the Next.js application."""
    nextjs_status_url = os.environ.get('NEXTJS_STATUS_URL', 'http://localhost:9002/api/print-status') # Get URL from env or use default
    if not nextjs_status_url:
        logging.warning("NEXTJS_STATUS_URL not set. Skipping status notification.")
        return

    payload = {
        "status": status, # "success" or "error"
    }
    if message:
        payload["message"] = message
    if job_id:
        payload["jobId"] = str(job_id) # Ensure it's a string if it's an ID
    if printer_name:
        payload["printerName"] = printer_name

    try:
        response = requests.post(nextjs_status_url, json=payload, timeout=5) # 5 second timeout
        response.raise_for_status() # Raise an exception for bad status codes (4xx or 5xx)
        logging.info(f"Successfully notified Next.js: Status {status}, Response: {response.status_code}")
    except requests.exceptions.RequestException as e:
        logging.error(f"Failed to notify Next.js at {nextjs_status_url}: {e}", exc_info=True)
    except Exception as e:
        logging.error(f"An unexpected error occurred during Next.js notification: {e}", exc_info=True)


# --- API Endpoints ---

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    logging.info("Health check requested.")
    return jsonify({"status": "ok", "platform": SYSTEM_PLATFORM, "printer_lib": printer_lib or "none"})

@app.route('/printers', methods=['GET'])
def get_printers():
    """Returns a list of available printers."""
    logging.info("Printer list requested.")
    printers = []
    error_message = None

    if printer_lib == "win32":
        printers = get_printers_windows()
    elif printer_lib == "cups":
        printers = get_printers_cups()
    else:
        error_message = "Printing library not available or platform not supported."
        logging.warning(error_message)
        # Return empty list but indicate the issue server-side
        return jsonify({"detail": error_message}), 500 # Internal Server Error seems appropriate

    if printers is None: # If the platform function itself failed internally
         error_message = f"Failed to retrieve printers on {SYSTEM_PLATFORM}."
         return jsonify({"detail": error_message}), 500

    return jsonify(printers)

@app.route('/print', methods=['POST'])
def print_label():
    """Receives PDF data (Base64) and printer name, then prints."""
    logging.info("Received /print request.")
    if not request.is_json:
        logging.error("Request is not JSON.")
        return jsonify({"detail": "Request must be JSON"}), 400

    data = request.get_json()
    pdf_b64 = data.get('pdfData')
    printer_name = data.get('printerName')
    job_id = data.get('jobId') # Optional Job ID from Next.js

    if not pdf_b64 or not printer_name:
        logging.error(f"Missing required fields. pdfData provided: {bool(pdf_b64)}, printerName provided: {bool(printer_name)}")
        missing = []
        if not pdf_b64: missing.append("'pdfData'")
        if not printer_name: missing.append("'printerName'")
        return jsonify({"detail": f"Missing required field(s): {', '.join(missing)}"}), 400

    try:
        pdf_bytes = base64.b64decode(pdf_b64)
        logging.info(f"Successfully decoded {len(pdf_bytes)} bytes of PDF data.")
    except (TypeError, base64.binascii.Error) as e:
        logging.error(f"Invalid Base64 PDF data received: {e}", exc_info=True)
        return jsonify({"detail": "Invalid Base64 encoding for pdfData"}), 400
    except Exception as e:
        logging.error(f"Unexpected error during Base64 decoding: {e}", exc_info=True)
        return jsonify({"detail": "Error decoding PDF data"}), 500

    print_successful = False
    error_message = "Printing library not available or platform not supported."

    try:
        if printer_lib == "win32":
            logging.info(f"Attempting to print via win32print to '{printer_name}'...")
            print_successful = print_windows(printer_name, pdf_bytes, job_name=f"LabelVision-{job_id or 'Job'}")
            if not print_successful: error_message = "win32print job submission failed."

        elif printer_lib == "cups":
            logging.info(f"Attempting to print via pycups to '{printer_name}'...")
            print_successful = print_cups(printer_name, pdf_bytes, job_name=f"LabelVision-{job_id or 'Job'}")
            if not print_successful: error_message = "CUPS job submission failed."

        else:
             logging.warning(f"No printing library available for {SYSTEM_PLATFORM}. Cannot print.")
             # Keep print_successful as False, error_message is already set

    except ValueError as ve: # Specific error for printer not found etc.
        logging.error(f"Printing value error: {ve}", exc_info=False) # Log less verbosely for known errors
        error_message = str(ve)
        # Optional: Notify Next.js about the specific failure
        notify_nextjs("error", message=error_message, job_id=job_id, printer_name=printer_name)
        return jsonify({"detail": error_message}), 404 # Not Found is reasonable if printer is missing

    except Exception as e: # Catch unexpected errors during printing
        logging.error(f"Unexpected error during printing process: {e}", exc_info=True)
        error_message = f"An unexpected error occurred during printing: {e}"
        # Optional: Notify Next.js about the unexpected failure
        notify_nextjs("error", message=error_message, job_id=job_id, printer_name=printer_name)
        return jsonify({"detail": error_message}), 500

    # --- Final Response & Notification ---
    if print_successful:
        logging.info(f"Print job successfully sent to '{printer_name}'.")
        # Optional: Notify Next.js about success *after* sending the job
        notify_nextjs("success", message="Print job sent successfully.", job_id=job_id, printer_name=printer_name)
        return jsonify({"message": f"Print job sent successfully to {printer_name}"}), 200
    else:
        logging.error(f"Print job failed for '{printer_name}'. Reason: {error_message}")
        # Optional: Notify Next.js (might have already been notified in specific error handling)
        # notify_nextjs("error", message=error_message, job_id=job_id, printer_name=printer_name)
        status_code = 500 if "library not available" in error_message else 400 # Use 500 if fundamental issue, 400 otherwise
        return jsonify({"detail": error_message}), status_code


# --- Main Execution ---
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001)) # Use PORT env var or default to 5001
    logging.info(f"Starting Flask server on port {port}...")
    # Use host='0.0.0.0' to make it accessible from the network if needed,
    # otherwise '127.0.0.1' restricts it to the local machine.
    app.run(host='127.0.0.1', port=port, debug=False) # Turn debug=False for production/stable use
