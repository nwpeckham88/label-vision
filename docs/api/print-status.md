# API Documentation: /api/print-status

This document describes the API endpoint `/api/print-status` used by the Label Vision application. This endpoint is designed to receive status updates from an external printing service (e.g., a Python desktop application) after a print job has been processed.

## Endpoint: `/api/print-status`

### Purpose

To allow an external printing service to notify the Next.js application about the success or failure of a print job initiated by the user.

### Method: `POST`

### Request Body

The request body must be in JSON format and should adhere to the following schema:

```typescript
{
  jobId?: string; // Optional: An identifier for the specific print job.
  status: "success" | "error"; // Required: The outcome of the print job.
  message?: string; // Optional: A detailed message about the status (e.g., error details).
  printerName?: string; // Optional: The name of the printer that handled the job.
}
```

**Field Descriptions:**

*   `jobId` (String, Optional): A unique identifier that might have been assigned to the print job when it was initiated. Helps correlate the status update with a specific request.
*   `status` (String, Required): Indicates the final status of the print attempt. Must be either `"success"` or `"error"`.
*   `message` (String, Optional): Provides additional context or details about the status. Especially useful for reporting error messages.
*   `printerName` (String, Optional): The name or identifier of the printer used for the attempt.

**Example Request Body (Success):**

```json
{
  "jobId": "label-12345",
  "status": "success",
  "printerName": "MyLabelPrinter_XYZ"
}
```

**Example Request Body (Error):**

```json
{
  "jobId": "label-67890",
  "status": "error",
  "message": "Printer offline or out of labels.",
  "printerName": "OfficeLabelPrinter_1"
}
```

### Responses

*   **`200 OK`**:
    *   **Content:** `application/json`
    *   **Body:** `{ "message": "Status received successfully" }`
    *   **Description:** The status update was received and validated successfully. The Next.js application has logged the update (or will process it further, e.g., via WebSockets - currently placeholder).

*   **`400 Bad Request`**:
    *   **Content:** `application/json`
    *   **Body:** `{ "error": "Invalid payload", "details": [<validation_errors>] }`
    *   **Description:** The request body did not conform to the expected schema. The `details` array contains information about the validation errors.

*   **`500 Internal Server Error`**:
    *   **Content:** `application/json`
    *   **Body:** `{ "error": "Failed to process status update", "details": "<error_message>" }`
    *   **Description:** An unexpected error occurred on the server while processing the request. The `details` field contains the server error message.

### Method: `GET`

### Purpose

Provides a simple health check to confirm the API endpoint is active.

### Request Body

None.

### Responses

*   **`200 OK`**:
    *   **Content:** `application/json`
    *   **Body:** `{ "message": "Print Status API is active. Use POST to submit status." }`
    *   **Description:** Confirms that the API route is running and accessible.

### Notes

*   This endpoint currently logs the received status to the server console. In a production application, this would typically trigger further actions like updating a database record, notifying the user via WebSockets, or logging to a monitoring system.
*   Authentication/Authorization is not currently implemented for this endpoint but would be crucial in a production environment to ensure status updates are legitimate.
