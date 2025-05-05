# API Documentation: Python Desktop Print Service

This document describes the API endpoints exposed by the Python desktop application designed to act as a print service for the Label Vision Next.js web application.

## Base URL

The Python application typically runs a local web server (e.g., using Flask or FastAPI). The default base URL is assumed to be:

`http://localhost:5001`

(This port can be configured in the Python application).

## Endpoints

### 1. Health Check

*   **Endpoint:** `/health`
*   **Method:** `GET`
*   **Purpose:** Allows the Next.js application to check if the Python print service is running and reachable.
*   **Request Body:** None
*   **Responses:**
    *   **`200 OK`**:
        *   **Content:** `application/json`
        *   **Body:** `{ "status": "ok" }`
        *   **Description:** The service is running and healthy.
    *   **(Implicit) Connection Error:** If the Next.js app cannot connect to this endpoint (e.g., `fetch` fails), it indicates the Python service is likely not running or is inaccessible.

### 2. Get Available Printers

*   **Endpoint:** `/printers`
*   **Method:** `GET`
*   **Purpose:** Retrieves a list of printer names known to the system where the Python application is running.
*   **Request Body:** None
*   **Responses:**
    *   **`200 OK`**:
        *   **Content:** `application/json`
        *   **Body:** `["Printer Name 1", "Microsoft Print to PDF", "My Label Printer ZT410"]` (Example)
        *   **Description:** Successfully retrieved the list of available printer names as an array of strings. The list might be empty if no printers are found.
    *   **`500 Internal Server Error`**:
        *   **Content:** `application/json`
        *   **Body:** `{ "detail": "Error message describing the failure" }`
        *   **Description:** An error occurred on the Python server while trying to list printers (e.g., issues with `win32print` or `pycups`).

### 3. Print Label

*   **Endpoint:** `/print`
*   **Method:** `POST`
*   **Purpose:** Receives label data (as a PDF) and sends it to the specified printer.
*   **Request Body:**
    *   **Content-Type:** `application/json`
    *   **Schema:**
        ```typescript
        {
          pdfData: string; // Required: The generated PDF content, encoded as a Base64 string.
          printerName: string; // Required: The exact name of the target printer (must match one from the /printers list).
          // Optional: Add other print job options here if needed (e.g., copies, orientation)
        }
        ```
    *   **Example:**
        ```json
        {
          "pdfData": "JVBERi0xLjcKJeLjz9MKMSAwIG9iago8PCAvVHlwZSAvQ2F0YW...", // Truncated Base64 PDF data
          "printerName": "My Label Printer ZT410"
        }
        ```
*   **Responses:**
    *   **`200 OK`**:
        *   **Content:** `application/json`
        *   **Body:** `{ "message": "Print job sent successfully to [Printer Name]" }`
        *   **Description:** The print job was successfully submitted to the OS printing system for the specified printer.
    *   **`400 Bad Request`**:
        *   **Content:** `application/json`
        *   **Body:** `{ "detail": "Invalid payload: Missing required field 'pdfData'" }` or similar validation error.
        *   **Description:** The request body was malformed or missing required fields.
    *   **`404 Not Found`**:
        *   **Content:** `application/json`
        *   **Body:** `{ "detail": "Printer not found: [Printer Name]" }`
        *   **Description:** The specified `printerName` does not match any printer known to the system.
    *   **`500 Internal Server Error`**:
        *   **Content:** `application/json`
        *   **Body:** `{ "detail": "Error message describing the printing failure" }`
        *   **Description:** An error occurred during the printing process (e.g., communication error with the printer, invalid PDF data after decoding).

### 4. Notify Status (Optional - Python -> Next.js)

*   **Endpoint:** `/api/print-status` (On the **Next.js** application)
*   **Method:** `POST`
*   **Purpose:** Allows the Python application to send the final status (success/failure) of a print job back to the Next.js application.
*   **Request Body:** (See `docs/api/print-status.md` for the schema expected by the Next.js app)
    ```json
    {
      "jobId": "optional-job-id", // Optional
      "status": "success", // or "error"
      "message": "Printed successfully.", // Optional
      "printerName": "My Label Printer ZT410" // Optional
    }
    ```
*   **Note:** This requires the Python application to make an HTTP POST request *to* the Next.js application's API endpoint after the print job completes or fails. Implementation details for tracking job completion status depend heavily on the printing library used (`win32print`, `pycups`).

## Security Considerations (Important!)

*   **CORS (Cross-Origin Resource Sharing):** The Python API (Flask/FastAPI) **must** be configured to allow requests from the origin of the Next.js application (e.g., `http://localhost:9002` during development, or your production domain). Without proper CORS headers, the browser will block requests from the Next.js frontend.
*   **Network Access:** The Python application listens on a specific port (e.g., 5001). Ensure firewalls on the machine running the Python app allow incoming connections on this port from the machine running the Next.js app (if they are different machines). For simplicity, running both on the same machine is easiest initially.
*   **Authentication:** In a production scenario, you might want to add some form of simple authentication (e.g., a shared secret API key passed in headers) to ensure only the intended Next.js app can interact with the print service, although for a purely local setup, this might be overkill.
