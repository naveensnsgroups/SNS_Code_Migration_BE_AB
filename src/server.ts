import express from 'express';
import cors from 'cors';
import config from './config';
import connectDB from './db';
import scanRoute from './routes/scan';
import sessionRoute from './routes/session';
import localOutputRoute from './routes/localOutput';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api', scanRoute);
app.use('/api', sessionRoute);
app.use('/api', localOutputRoute);

connectDB()
  .then(() => {
    app.listen(config.port, () => console.log(`Backend listening on http://localhost:${config.port}`));
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
