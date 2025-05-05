
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Define the expected schema for the print status update
const PrintStatusSchema = z.object({
  jobId: z.string().optional().describe('An optional identifier for the print job.'),
  status: z.enum(['success', 'error']).describe('The status of the print job.'),
  message: z.string().optional().describe('An optional message providing more details.'),
  printerName: z.string().optional().describe('The name of the printer used.'),
});

type PrintStatusInput = z.infer<typeof PrintStatusSchema>;

/**
 * API route handler for POST requests to update print status.
 * This endpoint is intended to be called by the Python desktop print handler.
 *
 * @param req The incoming NextRequest object.
 * @returns A NextResponse object indicating success or failure.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Validate the incoming data against the schema
    const validationResult = PrintStatusSchema.safeParse(body);

    if (!validationResult.success) {
      console.error('Invalid print status payload:', validationResult.error.errors);
      return NextResponse.json(
        { error: 'Invalid payload', details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { status, message, jobId, printerName }: PrintStatusInput = validationResult.data;

    // --- Placeholder for handling the status update ---
    // In a real application, you might:
    // - Store the status in a database linked to the user or job ID.
    // - Use WebSockets (e.g., Pusher, Socket.IO) to push the status update to the relevant client(s) in real-time.
    // - Log the status update for monitoring.

    console.log('Received Print Status Update:');
    console.log('  Status:', status);
    if (jobId) console.log('  Job ID:', jobId);
    if (printerName) console.log('  Printer:', printerName);
    if (message) console.log('  Message:', message);
    // --- End Placeholder ---

    return NextResponse.json({ message: 'Status received successfully' }, { status: 200 });

  } catch (error) {
    console.error('Error processing print status update:', error);
    let errorMessage = 'Internal Server Error';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    return NextResponse.json({ error: 'Failed to process status update', details: errorMessage }, { status: 500 });
  }
}

/**
 * API route handler for GET requests (optional).
 * Could be used for health checks or retrieving status if needed.
 */
export async function GET() {
  return NextResponse.json({ message: 'Print Status API is active. Use POST to submit status.' });
}
