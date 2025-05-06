import os
import platform
import tempfile
import base64
import subprocess
import logging
import requests # For optional status callback
import sys
import io # For handling image bytes

# --- Gen AI Imports and Config ---
import google.generativeai as genai
from google.api_core import exceptions as google_exceptions # For specific error handling
from PIL import Image # To check image format/validity
# --- End Gen AI Imports and Config ---

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

# --- Configure Gen AI ---
# IMPORTANT: Configure API Key securely, preferably via environment variable
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    logging.warning("GEMINI_API_KEY environment variable not set. Label generation will not work.")
    genai_configured = False
else:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        genai_configured = True
        logging.info("Google Generative AI configured successfully.")
    except Exception as e:
        logging.error(f"Failed to configure Google Generative AI: {e}", exc_info=True)
        genai_configured = False
# --- End Configure Gen AI ---

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
    # Add specific log for this endpoint
    logging.info("Received request for /api/health") 
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

@app.route('/api/process-image-for-label', methods=['POST'])
def process_image_api():
    """API endpoint to process an image, identify items, generate a summary, and return both."""
    logging.info("API process image for label requested.")

    if not genai_configured:
        logging.error("Process image endpoint called but GenAI is not configured.")
        return jsonify({"detail": "AI service not configured. Check GEMINI_API_KEY."}), 503

    if not request.is_json:
        return jsonify({"detail": "Request must be JSON"}), 400

    data = request.get_json()
    image_b64 = data.get('imageData') # Expecting Base64 image data

    if not image_b64:
        return jsonify({"detail": "Missing 'imageData' (Base64) in request body"}), 400

    try:
        # Decode Base64 image data
        image_bytes = base64.b64decode(image_b64)
        # Validate image data using PIL
        img = Image.open(io.BytesIO(image_bytes))
        img.verify() # Verify that it's a valid image file
        # Reopen after verify
        img = Image.open(io.BytesIO(image_bytes))
        # Determine image format for the API call
        image_format = img.format
        if not image_format or image_format.lower() not in ['png', 'jpeg', 'jpg', 'webp', 'heic', 'heif']:
            logging.warning(f"Unsupported image format detected: {image_format}. Attempting anyway.")
            # Default to jpeg if format is unknown/unsupported by common web standards
            mime_type = "image/jpeg"
        else:
            mime_type = f"image/{image_format.lower().replace('jpg', 'jpeg')}"

        logging.info(f"Decoded {len(image_bytes)} bytes of image data. Format: {image_format}, MIME type for API: {mime_type}")

        # Prepare image part for Gemini API
        image_part = {
            "mime_type": mime_type,
            "data": image_bytes
        }

    except (TypeError, base64.binascii.Error) as e:
        logging.error(f"Invalid Base64 image data received: {e}")
        return jsonify({"detail": "Invalid Base64 encoding for imageData"}), 400
    except UnidentifiedImageError:
        logging.error("Failed to identify image format or invalid image data.")
        return jsonify({"detail": "Invalid or unsupported image data"}), 400
    except Exception as e:
        logging.error(f"Error processing image data: {e}", exc_info=True)
        return jsonify({"detail": "Failed to process image data"}), 500

    try:
        # Prepare the prompt for item identification and summarization
        prompt = (
            "Analyze the provided image.\n"
            "1. Identify the distinct physical items visible in the image. List them clearly, one item per line.\n"
            "2. Based ONLY on the items you identified, generate a concise summary (max 5 words) suitable for a label header. Focus on the most prominent items.\n\n"
            "Format your response exactly like this:\n"
            "Identified Items:\n"
            "- Item 1 Name\n"
            "- Item 2 Name\n"
            "...\n"
            "Summary:\n"
            "Generated Summary Text"
        )

        # Select the vision model
        # gemini-1.5-flash-latest is generally good for multimodal tasks
        model = genai.GenerativeModel('gemini-1.5-flash-latest')

        # Generate content using the image and prompt
        logging.info("Sending image and prompt to Gemini for item identification and summary.")
        # The API expects a list of content parts
        response = model.generate_content([prompt, image_part])

        # --- Parse the Response --- 
        # This part is crucial and depends heavily on the model following the format instructions.
        # It might need adjustments based on actual model output.
        raw_response_text = response.text.strip()
        logging.info(f"Received raw response from Gemini:\n{raw_response_text}")

        identified_items = []
        summary = "Error: Could not parse summary"

        try:
            items_section = raw_response_text.split("Identified Items:")[1].split("Summary:")[0].strip()
            summary_section = raw_response_text.split("Summary:")[1].strip()

            # Extract items (lines starting with '-')
            for line in items_section.split('\n'):
                if line.strip().startswith('-'):
                    item = line.strip()[1:].strip() # Remove leading '-' and whitespace
                    if item:
                        identified_items.append(item)
            
            # Extract summary (first line of the summary section)
            summary = summary_section.split('\n')[0].strip()

            if not identified_items:
                 logging.warning("Parsing extracted 0 items, though model response might contain them.")
            if summary == "Error: Could not parse summary":
                logging.warning("Parsing failed to extract summary, using default error.")

        except IndexError:
            logging.error(f"Failed to parse Gemini response structure. Raw response:\n{raw_response_text}")
            # Attempt a fallback: treat the whole response as summary if parsing fails
            summary = raw_response_text[:100] # Limit length
            identified_items = [] # Cannot reliably parse items
            # Return a specific error? For now, return potentially garbled summary.
        except Exception as parse_e:
            logging.error(f"Unexpected error parsing Gemini response: {parse_e}. Raw response:\n{raw_response_text}")
            summary = raw_response_text[:100]
            identified_items = []
        # --- End Parsing --- 

        logging.info(f"Processed result - Items: {identified_items}, Summary: '{summary}'")
        return jsonify({"identifiedItems": identified_items, "summary": summary})

    except google_exceptions.GoogleAPIError as ge:
        logging.error(f"Google API error during Gemini call: {ge}", exc_info=True)
        return jsonify({"detail": f"AI service API error: {ge.message}"}), 502 # Bad Gateway
    except Exception as e:
        logging.error(f"Error during Gemini processing: {e}", exc_info=True)
        return jsonify({"detail": "Failed to process image with AI due to an internal error."}), 500

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
    # Log the path being requested
    logging.info(f"Serving request for path: {path or '/'}") 

    # Construct the full path relative to the web app directory
    full_path = os.path.join(WEB_APP_DIR, path)
    logging.debug(f"Attempting to serve filesystem path: {full_path}")

    # Check if the requested path points to an existing file
    if path and os.path.exists(full_path) and os.path.isfile(full_path):
        # Serve the specific static file (e.g., image, css, js chunk)
        logging.info(f"Serving static file: {path}")
        return send_from_directory(WEB_APP_DIR, path)
    else:
        # Serve the main index.html for the root or any non-file path
        # This allows Next.js client-side router to handle the route
        index_path = os.path.join(WEB_APP_DIR, 'index.html')
        logging.info(f"Attempting to serve index.html from: {index_path}")
        if not os.path.exists(index_path):
            logging.error(f"Web app index.html not found at {index_path}. Build the Next.js app first ('npm run build').")
            return jsonify({"error": "Web application not found. Please build the Next.js frontend."}), 404
        logging.info(f"Serving index.html for path: {path or '/'}")
        return send_file(index_path)


# --- Main Execution ---
if __name__ == '__main__':
    # Log entry into the main execution block
    logging.info("Starting main execution block (__name__ == '__main__')") 

    # Use environment variable for port, default to 5001
    port = int(os.environ.get('BACKEND_PORT', 5001))
    # Use environment variable for host.
    # Default to '0.0.0.0' which is suitable for Docker/network access.
    # For local-only development, you might set BACKEND_HOST=127.0.0.1 explicitly.
    host = os.environ.get('BACKEND_HOST', '0.0.0.0')
    # Use environment variable for debug mode, default to False
    debug_mode = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'

    # Log the determined host and port before starting server
    logging.info(f"Flask development server configured for {host}:{port} (Debug: {debug_mode})" ) 
    logging.info(f"Web application static root directory: {WEB_APP_DIR}")

    if not os.path.exists(WEB_APP_DIR) or not os.path.exists(os.path.join(WEB_APP_DIR, 'index.html')):
         logging.warning("---")
         logging.warning(f"Web app directory ('{WEB_APP_DIR}') or index.html not found.")
         logging.warning("Ensure you have run 'npm run build' in the Next.js project root.")
         logging.warning("API endpoints will work, but the web interface will not load.")
         logging.warning("---")

    # Important: When using Gunicorn via Docker CMD, these app.run settings are bypassed.
    # They are primarily for direct `python app.py` execution.
    # Add a log before attempting to run the dev server
    logging.info("Attempting to start Flask development server using app.run()...") 
    app.run(host=host, port=port, debug=debug_mode)
    # Add a log *after* app.run() if it ever returns (e.g., on shutdown)
    logging.info("Flask development server has stopped.") 