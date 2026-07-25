// Vercel serverless entry — wraps the Express app with a cached Mongo connection.
import app from '../src/app';
import connectDB from '../src/config/database';

let dbReady: Promise<void> | null = null;

export default async function handler(req: any, res: any) {
  try {
    if (!dbReady) {
      dbReady = connectDB().catch((e) => {
        dbReady = null;
        throw e;
      });
    }
    await dbReady;
  } catch (e) {
    res.status(500).json({ success: false, message: 'Database connection failed' });
    return;
  }
  return (app as any)(req, res);
}
