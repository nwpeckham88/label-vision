# API Documentation: /api/print-status (Next.js Endpoint - Independent Deployment)

**Important Note:** This API endpoint is relevant **only** if you are running the Next.js application as a **separate process** (e.g., using `npm run dev` or `npm start` independently) and you want the Python desktop application (`python-print-service/app.py`) to send print status updates *back* to that separate Next.js instance.

**When the Python Flask application serves the static Next.js frontend (as configured in the `Dockerfile` and `python-print-service/app.py`), this endpoint on the Next.js side is typically NOT used.** Feedback mechanisms in that scenario would usually involve the frontend polling the Python `/api/health` or potentially a WebSocket connection if implemented.

---

This document describes the API endpoint `/api/print-status` within a **standalone Next.js application**. This endpoint is designed to **receive** status updates from an external printing service (e.g., the Python desktop application described in `docs/api/python-desktop-app.md`) *after* a print job has been processed by that external service.

## Endpoint: `/api/print-status` (on the Standalone Next.js App)

### Purpose

To allow an external printing service (like the Python desktop app) to notify a *separate* Next.js application about the success or failure of a print job that was *initiated* by the Next.js app sending data *to* the Python app's `/api/print` endpoint.

### Method: `POST`

### Request Body (Sent by the Python App)

The request body must be in JSON format and should adhere to the following schema:

```typescript
{
  jobId?: string; // Optional: An identifier for the specific print job (if tracked).
  status: "success" | "error"; // Required: The final outcome of the print job.
  message?: string; // Optional: A detailed message about the status (e.g., error details from the printer).
  printerName?: string; // Optional: The name of the printer that handled the job.
}
```

**Field Descriptions:**

*   `jobId` (String, Optional): A unique identifier that might correlate the status update with the initial `/api/print` request sent to the Python app.
*   `status` (String, Required): Indicates the final status of the print attempt. Must be either `"success"` or `"error"`.
*   `message` (String, Optional): Provides additional context or details from the printing system or printer itself.
*   `printerName` (String, Optional): The name or identifier of the printer used.

**Example Request Body (Success - Sent by Python to Standalone Next.js):**

```json
{
  "jobId": "label-12345",
  "status": "success",
  "printerName": "MyLabelPrinter_XYZ",
  "message": "Print job completed successfully."
}
```

**Example Request Body (Error - Sent by Python to Standalone Next.js):**

```json
{
  "jobId": "label-67890",
  "status": "error",
  "message": "Printer offline or out of labels.",
  "printerName": "OfficeLabelPrinter_1"
}
```

### Responses (Sent by Standalone Next.js back to Python)

*   **`200 OK`**:
    *   **Content:** `application/json`
    *   **Body:** `{ "message": "Status received successfully" }`
    *   **Description:** The status update was received and validated successfully by the Next.js backend. The Next.js application has logged the update.

*   **`400 Bad Request`**:
    *   **Content:** `application/json`
    *   **Body:** `{ "error": "Invalid payload", "details": [<validation_errors>] }`
    *   **Description:** The request body sent by the Python app did not conform to the expected schema.

*   **`500 Internal Server Error`**:
    *   **Content:** `application/json`
    *   **Body:** `{ "error": "Failed to process status update", "details": "<error_message>" }`
    *   **Description:** An unexpected error occurred on the Next.js server while processing the status update.

### Method: `GET`

### Purpose

Provides a simple health check to confirm the **standalone Next.js API endpoint** itself is active.

### Request Body

None.

### Responses

*   **`200 OK`**:
    *   **Content:** `application/json`
    *   **Body:** `{ "message": "Print Status API (Standalone Next.js) is active. Use POST to submit status." }`
    *   **Description:** Confirms that the Next.js API route is running and accessible.

### Notes (Standalone Next.js Context)

*   This endpoint currently logs the received status to the Next.js server console. In a more advanced application, receiving a status update here could:
    *   Update a database record associated with the print job.
    *   Use WebSockets (e.g., Pusher, Socket.IO, or Firebase Realtime Database listeners) to push the status update to the specific user's browser session for real-time UI feedback.
    *   Log the status to a monitoring system.
*   Authentication/Authorization would be advisable in production to ensure status updates originate from a trusted source (the Python app).
