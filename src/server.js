const express = require('express');
const cors = require('cors');
const config = require('./config');
const connectDB = require('./db');
const scanRoute = require('./routes/scan');
const sessionRoute = require('./routes/session');
const localOutputRoute = require('./routes/localOutput');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

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
